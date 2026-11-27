import { WorkspaceFile } from '../types';

export interface CanvasDrawCommand {
  op: 'clear' | 'color' | 'lineWidth' | 'line' | 'rect' | 'fillRect' | 'circle' | 'fillCircle' | 'oval' | 'fillOval' | 'text';
  args: (string | number)[];
}

export function hasPythonVisualLibrary(code: string): boolean {
  return /(?:^|\n)\s*(?:import|from)\s+(?:pygame|turtle|matplotlib|pylab|seaborn|tkinter|PIL)\b/m.test(code || '');
}

const safeJson = (val: unknown): string =>
  JSON.stringify(val)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

/**
 * Generates a self-contained HTML5 sandbox runner supporting:
 * - Python `pygame` (2D sprites, Surface, Rect, draw shapes, font, clock, keyboard/mouse events, async game loop)
 * - Python `turtle` (Screen, Turtle, forward/backward/left/right/goto/circle/begin_fill/end_fill/write/etc.)
 * - Python `matplotlib` / `seaborn` (captures plt.show() as crisp PNG rendered onto the stage)
 * - Multi-file `/workspace` Python imports + interactive stdin + minimizable iframe console
 */
export function buildPythonVisualRunnerHtml(
  files: WorkspaceFile[],
  entryPath: string,
  stdinText: string = ''
): string {
  const workspaceTextFiles = files
    .filter((f) => !f.isBinary && typeof f.content === 'string')
    .map((f) => ({ path: f.path.replace(/^\/+/, ''), content: f.content || '' }));

  const entryFile =
    workspaceTextFiles.find((f) => f.path === entryPath) ||
    workspaceTextFiles.find((f) => /\.py$/i.test(f.path)) ||
    { path: entryPath || 'main.py', content: '' };

  const pythonPrelude = `
import sys, io, os, math, time, json, types, asyncio, ast, builtins
from js import window, document

os.chdir('/workspace')
if '/workspace' not in sys.path:
    sys.path.insert(0, '/workspace')

_tm_stdin_raw = ${JSON.stringify(stdinText || '')}
sys.stdin = io.StringIO(_tm_stdin_raw)
_tm_input_lines = _tm_stdin_raw.splitlines()
_tm_input_idx = 0
def _tm_input(prompt=""):
    global _tm_input_idx
    if prompt:
        window.__tmPushLog('info', str(prompt))
    if _tm_input_idx < len(_tm_input_lines):
        v = _tm_input_lines[_tm_input_idx]
        _tm_input_idx += 1
        return v
    return ""
builtins.input = _tm_input

class _TmStreamWriter(io.TextIOBase):
    def __init__(self, level='log'):
        self.level = level
        self.buf = ''
    def write(self, s):
        if not s:
            return 0
        self.buf += s
        while '\\n' in self.buf:
            line, self.buf = self.buf.split('\\n', 1)
            window.__tmPushLog(self.level, line)
        return len(s)
    def flush(self):
        if self.buf:
            window.__tmPushLog(self.level, self.buf)
            self.buf = ''

sys.stdout = _TmStreamWriter('log')
sys.stderr = _TmStreamWriter('error')

# ---- MATPLOTLIB IMAGE CAPTURE ----
os.environ['MPLBACKEND'] = 'agg'
def _tm_hook_matplotlib():
    try:
        import matplotlib.pyplot as plt
        import base64
        def _tm_show(*args, **kwargs):
            buf = io.BytesIO()
            plt.savefig(buf, format='png', dpi=150, bbox_inches='tight')
            buf.seek(0)
            b64 = base64.b64encode(buf.read()).decode('ascii')
            window.__tmShowPlotImage('data:image/png;base64,' + b64)
            plt.close('all')
        plt.show = _tm_show
    except Exception:
        pass

# ---- TURTLE SHIM ON HTML5 CANVAS ----
_turtle_mod = types.ModuleType('turtle')

class _TurtleScreen:
    _instance = None
    def __init__(self):
        self._bgcolor = '#ffffff'
        self._title = 'Python Turtle'
        self._w = 640
        self._h = 440
        self._tracer_n = 1
        self._turtles = []
        self._key_handlers = {}
        window.__tmInitCanvas(self._w, self._h, self._title, self._bgcolor)
    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = _TurtleScreen()
        return cls._instance
    def setup(self, width=640, height=440, startx=None, starty=None):
        self._w = int(width) if isinstance(width, (int, float)) and width > 10 else 640
        self._h = int(height) if isinstance(height, (int, float)) and height > 10 else 440
        window.__tmInitCanvas(self._w, self._h, self._title, self._bgcolor)
    def bgcolor(self, *args):
        if args:
            self._bgcolor = str(args[0])
            window.__tmTurtleBg(self._bgcolor)
        return self._bgcolor
    def title(self, t):
        self._title = str(t)
        window.__tmSetCaption(self._title)
    def tracer(self, n=1, delay=None):
        self._tracer_n = n
    def update(self):
        pass
    def clear(self):
        window.__tmTurtleClear(self._bgcolor)
    def reset(self):
        self.clear()
    def listen(self, *args):
        pass
    def onkey(self, fun, key):
        self._key_handlers[str(key).lower()] = fun
        window.__tmRegisterKeyHandler(str(key).lower())
    def onkeypress(self, fun, key):
        self.onkey(fun, key)
    def mainloop(self):
        pass
    def done(self):
        pass
    def exitonclick(self):
        pass

def _turtle_norm_color(*args):
    if len(args) == 1:
        c = args[0]
        if isinstance(c, tuple) and len(c) >= 3:
            r, g, b = c[:3]
            if max(r, g, b) <= 1.0:
                r, g, b = int(r * 255), int(g * 255), int(b * 255)
            return f'rgb({int(r)},{int(g)},{int(b)})'
        return str(c)
    if len(args) >= 3:
        r, g, b = args[:3]
        if max(r, g, b) <= 1.0:
            r, g, b = int(r * 255), int(g * 255), int(b * 255)
        return f'rgb({int(r)},{int(g)},{int(b)})'
    return '#111827'

class _Turtle:
    def __init__(self, shape='classic'):
        self._screen = _TurtleScreen.get_instance()
        self._x = 0.0
        self._y = 0.0
        self._angle = 0.0
        self._pen = True
        self._pencolor = '#111827'
        self._fillcolor = '#3b82f6'
        self._pensize = 2
        self._speed = 6
        self._visible = True
        self._filling = False
        self._fill_pts = []
        self._screen._turtles.append(self)
    def _to_canvas(self, x, y):
        return (self._screen._w / 2.0 + x, self._screen._h / 2.0 - y)
    def _move(self, nx, ny):
        cx0, cy0 = self._to_canvas(self._x, self._y)
        cx1, cy1 = self._to_canvas(nx, ny)
        if self._pen:
            window.__tmTurtleLine(cx0, cy0, cx1, cy1, self._pencolor, self._pensize)
        self._x = float(nx)
        self._y = float(ny)
        if self._filling:
            self._fill_pts.append([cx1, cy1])
        if self._visible:
            window.__tmTurtleCursor(cx1, cy1, self._angle, self._pencolor, True)
    def forward(self, d):
        rad = math.radians(self._angle)
        self._move(self._x + d * math.cos(rad), self._y + d * math.sin(rad))
    fd = forward
    def backward(self, d):
        self.forward(-d)
    bk = backward
    back = backward
    def right(self, deg):
        self._angle = (self._angle - deg) % 360.0
    rt = right
    def left(self, deg):
        self._angle = (self._angle + deg) % 360.0
    lt = left
    def setheading(self, to_angle):
        self._angle = float(to_angle) % 360.0
    seth = setheading
    def heading(self):
        return self._angle
    def goto(self, x, y=None):
        if y is None and isinstance(x, (tuple, list)):
            nx, ny = x[0], x[1]
        else:
            nx, ny = x, y
        self._move(float(nx), float(ny))
    setpos = goto
    setposition = goto
    def setx(self, x):
        self._move(float(x), self._y)
    def sety(self, y):
        self._move(self._x, float(y))
    def xcor(self):
        return self._x
    def ycor(self):
        return self._y
    def pos(self):
        return (self._x, self._y)
    position = pos
    def home(self):
        self._move(0.0, 0.0)
        self._angle = 0.0
    def penup(self):
        self._pen = False
    pu = penup
    up = penup
    def pendown(self):
        self._pen = True
    pd = pendown
    down = pendown
    def pensize(self, w=None):
        if w is not None:
            self._pensize = float(w)
        return self._pensize
    width = pensize
    def pencolor(self, *args):
        if args:
            self._pencolor = _turtle_norm_color(*args)
        return self._pencolor
    def fillcolor(self, *args):
        if args:
            self._fillcolor = _turtle_norm_color(*args)
        return self._fillcolor
    def color(self, *args):
        if len(args) == 1:
            c = _turtle_norm_color(args[0])
            self._pencolor = c
            self._fillcolor = c
        elif len(args) == 2 and not isinstance(args[0], (int, float)):
            self._pencolor = _turtle_norm_color(args[0])
            self._fillcolor = _turtle_norm_color(args[1])
        elif len(args) >= 3:
            c = _turtle_norm_color(*args)
            self._pencolor = c
            self._fillcolor = c
        return (self._pencolor, self._fillcolor)
    def begin_fill(self):
        self._filling = True
        cx, cy = self._to_canvas(self._x, self._y)
        self._fill_pts = [[cx, cy]]
    def end_fill(self):
        if self._filling and len(self._fill_pts) >= 3:
            window.__tmTurtleFill(json.dumps(self._fill_pts), self._fillcolor)
        self._filling = False
        self._fill_pts = []
    def circle(self, radius, extent=None, steps=None):
        ext = 360.0 if extent is None else float(extent)
        n = int(steps) if steps else max(18, min(90, int(abs(ext) / 4)))
        frac = ext / 360.0
        w = 2.0 * math.pi * radius * frac
        l = w / n
        turn = ext / n
        for _ in range(n):
            self.forward(l)
            self.left(turn)
    def dot(self, size=None, *color_args):
        d = size if size is not None else max(self._pensize + 4, 2 * self._pensize)
        c = _turtle_norm_color(*color_args) if color_args else self._pencolor
        cx, cy = self._to_canvas(self._x, self._y)
        window.__tmTurtleDot(cx, cy, d / 2.0, c)
    def write(self, arg, move=False, align='left', font=('Arial', 12, 'normal')):
        cx, cy = self._to_canvas(self._x, self._y)
        fsize = font[1] if isinstance(font, (tuple, list)) and len(font) > 1 else 12
        fname = font[0] if isinstance(font, (tuple, list)) and len(font) > 0 else 'sans-serif'
        window.__tmTurtleText(cx, cy, str(arg), self._pencolor, fsize, fname, align)
    def speed(self, s=None):
        if s is not None:
            self._speed = s
        return self._speed
    def hideturtle(self):
        self._visible = False
        window.__tmTurtleCursor(0, 0, 0, self._pencolor, False)
    ht = hideturtle
    def showturtle(self):
        self._visible = True
    st = showturtle
    def shape(self, name=None):
        return name or 'classic'
    def clear(self):
        self._screen.clear()
    def reset(self):
        self._x = 0.0
        self._y = 0.0
        self._angle = 0.0
        self._screen.clear()
    def bgcolor(self, *args):
        return self._screen.bgcolor(*args)

_default_turtle = None
def _get_default_turtle():
    global _default_turtle
    if _default_turtle is None:
        _default_turtle = _Turtle()
    return _default_turtle

_turtle_mod.Screen = lambda: _TurtleScreen.get_instance()
_turtle_mod.Turtle = _Turtle
_turtle_mod.Pen = _Turtle
for _fn in [
    'forward','fd','backward','bk','back','right','rt','left','lt','goto','setpos','setposition',
    'setx','sety','setheading','seth','heading','xcor','ycor','pos','position','home',
    'penup','pu','up','pendown','pd','down','pensize','width','pencolor','fillcolor','color',
    'begin_fill','end_fill','circle','dot','write','speed','hideturtle','ht','showturtle','st',
    'shape','clear','reset','bgcolor'
]:
    setattr(_turtle_mod, _fn, (lambda name: (lambda *a, **kw: getattr(_get_default_turtle(), name)(*a, **kw)))(_fn))
for _sfn in ['setup','title','tracer','update','listen','onkey','onkeypress','mainloop','done','exitonclick']:
    setattr(_turtle_mod, _sfn, (lambda name: (lambda *a, **kw: getattr(_TurtleScreen.get_instance(), name)(*a, **kw)))(_sfn))
_turtle_mod.colormode = lambda cmode=None: 255
sys.modules['turtle'] = _turtle_mod

# ---- PYGAME SHIM ON HTML5 CANVAS ----
_pygame_mod = types.ModuleType('pygame')
_pygame_mod.QUIT = 256
_pygame_mod.KEYDOWN = 768
_pygame_mod.KEYUP = 769
_pygame_mod.MOUSEBUTTONDOWN = 1025
_pygame_mod.MOUSEBUTTONUP = 1026
_pygame_mod.MOUSEMOTION = 1024
_pygame_mod.K_UP = 273
_pygame_mod.K_DOWN = 274
_pygame_mod.K_RIGHT = 275
_pygame_mod.K_LEFT = 276
_pygame_mod.K_SPACE = 32
_pygame_mod.K_RETURN = 13
_pygame_mod.K_ESCAPE = 27
for _ch in 'abcdefghijklmnopqrstuvwxyz0123456789':
    setattr(_pygame_mod, 'K_' + _ch, ord(_ch))

def _pg_color(c):
    if isinstance(c, _PgColor):
        return f'rgba({c.r},{c.g},{c.b},{c.a/255.0})'
    if isinstance(c, (tuple, list)):
        if len(c) == 4:
            return f'rgba({int(c[0])},{int(c[1])},{int(c[2])},{float(c[3])/255.0})'
        if len(c) >= 3:
            return f'rgb({int(c[0])},{int(c[1])},{int(c[2])})'
    return str(c)

class _PgColor:
    def __init__(self, r, g=0, b=0, a=255):
        if isinstance(r, str):
            self.r, self.g, self.b, self.a = 255, 255, 255, 255
            self._str = r
        elif isinstance(r, (tuple, list)):
            self.r, self.g, self.b = int(r[0]), int(r[1]), int(r[2])
            self.a = int(r[3]) if len(r) > 3 else 255
            self._str = None
        else:
            self.r, self.g, self.b, self.a = int(r), int(g), int(b), int(a)
            self._str = None
    def __iter__(self):
        return iter((self.r, self.g, self.b, self.a))

class _PgRect:
    def __init__(self, x, y=0, w=0, h=0):
        if isinstance(x, (tuple, list)) and len(x) == 4:
            x, y, w, h = x
        elif isinstance(x, _PgRect):
            x, y, w, h = x.x, x.y, x.w, x.h
        self.x = float(x)
        self.y = float(y)
        self.w = float(w)
        self.h = float(h)
    @property
    def width(self): return self.w
    @width.setter
    def width(self, v): self.w = float(v)
    @property
    def height(self): return self.h
    @height.setter
    def height(self, v): self.h = float(v)
    @property
    def left(self): return self.x
    @left.setter
    def left(self, v): self.x = float(v)
    @property
    def right(self): return self.x + self.w
    @right.setter
    def right(self, v): self.x = float(v) - self.w
    @property
    def top(self): return self.y
    @top.setter
    def top(self, v): self.y = float(v)
    @property
    def bottom(self): return self.y + self.h
    @bottom.setter
    def bottom(self, v): self.y = float(v) - self.h
    @property
    def centerx(self): return self.x + self.w / 2.0
    @centerx.setter
    def centerx(self, v): self.x = float(v) - self.w / 2.0
    @property
    def centery(self): return self.y + self.h / 2.0
    @centery.setter
    def centery(self, v): self.y = float(v) - self.h / 2.0
    @property
    def center(self): return (self.centerx, self.centery)
    @center.setter
    def center(self, v): self.centerx, self.centery = v[0], v[1]
    @property
    def size(self): return (self.w, self.h)
    def copy(self): return _PgRect(self.x, self.y, self.w, self.h)
    def move(self, dx, dy): return _PgRect(self.x + dx, self.y + dy, self.w, self.h)
    def move_ip(self, dx, dy):
        self.x += dx
        self.y += dy
    def inflate(self, dw, dh): return _PgRect(self.x - dw / 2.0, self.y - dh / 2.0, self.w + dw, self.h + dh)
    def colliderect(self, other):
        o = other if isinstance(other, _PgRect) else _PgRect(*other)
        return (self.x < o.x + o.w and self.x + self.w > o.x and self.y < o.y + o.h and self.y + self.h > o.y)
    def collidepoint(self, pt, y=None):
        px, py = (pt[0], pt[1]) if y is None else (pt, y)
        return self.x <= px <= self.x + self.w and self.y <= py <= self.y + self.h
    def clamp_ip(self, other):
        o = other if isinstance(other, _PgRect) else _PgRect(*other)
        if self.w >= o.w: self.x = o.x + (o.w - self.w) / 2.0
        else: self.x = max(o.x, min(self.x, o.x + o.w - self.w))
        if self.h >= o.h: self.y = o.y + (o.h - self.h) / 2.0
        else: self.y = max(o.y, min(self.y, o.y + o.h - self.h))

class _PgSurface:
    def __init__(self, size=(640, 480), is_screen=False):
        self.w = int(size[0])
        self.h = int(size[1])
        self._is_screen = is_screen
        self._cmds = []
        self._text_payload = None
    def get_width(self): return self.w
    def get_height(self): return self.h
    def get_size(self): return (self.w, self.h)
    def get_rect(self, **kwargs):
        r = _PgRect(0, 0, self.w, self.h)
        for k, v in kwargs.items():
            setattr(r, k, v)
        return r
    def fill(self, color, rect=None):
        c = _pg_color(color)
        if rect is None:
            self._cmds.append(['fill', c])
        else:
            rc = rect if isinstance(rect, _PgRect) else _PgRect(*rect)
            self._cmds.append(['rect', c, rc.x, rc.y, rc.w, rc.h, 0])
    def blit(self, source, dest):
        if isinstance(dest, _PgRect): dx, dy = dest.x, dest.y
        else: dx, dy = float(dest[0]), float(dest[1])
        if source._text_payload:
            txt, color, fsize, fname = source._text_payload
            self._cmds.append(['text', txt, dx, dy, color, fsize, fname])
        else:
            for cmd in source._cmds:
                if cmd[0] == 'rect':
                    self._cmds.append(['rect', cmd[1], cmd[2] + dx, cmd[3] + dy, cmd[4], cmd[5], cmd[6]])
    def convert(self): return self
    def convert_alpha(self): return self

_pg_screen = None
_pg_display = types.ModuleType('pygame.display')
def _pg_set_mode(size=(640, 480), flags=0):
    global _pg_screen
    _pg_screen = _PgSurface(size, is_screen=True)
    window.__tmInitCanvas(int(size[0]), int(size[1]), 'Pygame Window', '#09090b')
    return _pg_screen
def _pg_flip():
    if _pg_screen is not None:
        window.__tmPgFlush(json.dumps(_pg_screen._cmds))
        _pg_screen._cmds = []
_pg_display.set_mode = _pg_set_mode
_pg_display.set_caption = lambda t: window.__tmSetCaption(str(t))
_pg_display.flip = _pg_flip
_pg_display.update = lambda *a: _pg_flip()
_pg_display.get_surface = lambda: _pg_screen
_pg_display.init = lambda: None

_pg_draw = types.ModuleType('pygame.draw')
def _pg_draw_rect(surf, color, rect, width=0, border_radius=0):
    r = rect if isinstance(rect, _PgRect) else _PgRect(*rect)
    surf._cmds.append(['rect', _pg_color(color), r.x, r.y, r.w, r.h, float(width), float(border_radius)])
    return r
def _pg_draw_circle(surf, color, center, radius, width=0):
    surf._cmds.append(['circle', _pg_color(color), float(center[0]), float(center[1]), float(radius), float(width)])
    return _PgRect(center[0] - radius, center[1] - radius, radius * 2, radius * 2)
def _pg_draw_line(surf, color, start_pos, end_pos, width=1):
    surf._cmds.append(['line', _pg_color(color), float(start_pos[0]), float(start_pos[1]), float(end_pos[0]), float(end_pos[1]), float(width)])
def _pg_draw_lines(surf, color, closed, points, width=1):
    pts = [[float(p[0]), float(p[1])] for p in points]
    surf._cmds.append(['polygon', _pg_color(color), pts, bool(closed), float(width), False])
def _pg_draw_polygon(surf, color, points, width=0):
    pts = [[float(p[0]), float(p[1])] for p in points]
    surf._cmds.append(['polygon', _pg_color(color), pts, True, float(width), width == 0])
def _pg_draw_ellipse(surf, color, rect, width=0):
    r = rect if isinstance(rect, _PgRect) else _PgRect(*rect)
    surf._cmds.append(['ellipse', _pg_color(color), r.x + r.w / 2.0, r.y + r.h / 2.0, max(1.0, r.w / 2.0), max(1.0, r.h / 2.0), float(width)])
_pg_draw.rect = _pg_draw_rect
_pg_draw.circle = _pg_draw_circle
_pg_draw.line = _pg_draw_line
_pg_draw.aaline = _pg_draw_line
_pg_draw.lines = _pg_draw_lines
_pg_draw.aalines = _pg_draw_lines
_pg_draw.polygon = _pg_draw_polygon
_pg_draw.ellipse = _pg_draw_ellipse

class _PgFontObj:
    def __init__(self, name='sans-serif', size=20):
        self.name = name or 'sans-serif'
        self.size = max(8, int(size))
    def render(self, text, antialias, color, background=None):
        s = _PgSurface((max(12, int(len(str(text)) * self.size * 0.6)), int(self.size * 1.25)))
        s._text_payload = (str(text), _pg_color(color), self.size, self.name)
        return s

_pg_font = types.ModuleType('pygame.font')
_pg_font.init = lambda: None
_pg_font.SysFont = lambda name, size, bold=False, italic=False: _PgFontObj(name, size)
_pg_font.Font = lambda file=None, size=20: _PgFontObj('sans-serif', size)

class _PgEventObj:
    def __init__(self, etype, **kw):
        self.type = etype
        for k, v in kw.items():
            setattr(self, k, v)

_pg_event = types.ModuleType('pygame.event')
def _pg_event_get():
    raw = json.loads(window.__tmDrainEvents())
    out = []
    for ev in raw:
        t = ev.get('type')
        if t == 'quit':
            out.append(_PgEventObj(_pygame_mod.QUIT))
        elif t == 'keydown':
            out.append(_PgEventObj(_pygame_mod.KEYDOWN, key=int(ev.get('key', 0)), unicode=ev.get('unicode', '')))
        elif t == 'keyup':
            out.append(_PgEventObj(_pygame_mod.KEYUP, key=int(ev.get('key', 0))))
        elif t == 'mousedown':
            out.append(_PgEventObj(_pygame_mod.MOUSEBUTTONDOWN, pos=tuple(ev.get('pos', [0, 0])), button=int(ev.get('button', 1))))
        elif t == 'mouseup':
            out.append(_PgEventObj(_pygame_mod.MOUSEBUTTONUP, pos=tuple(ev.get('pos', [0, 0])), button=int(ev.get('button', 1))))
        elif t == 'mousemove':
            out.append(_PgEventObj(_pygame_mod.MOUSEMOTION, pos=tuple(ev.get('pos', [0, 0]))))
    return out
_pg_event.get = _pg_event_get
_pg_event.poll = lambda: (_pg_event_get() or [_PgEventObj(0)])[0]
_pg_event.clear = lambda: window.__tmDrainEvents()

class _PgKeyState:
    def __init__(self, pressed_set):
        self._pressed = set(pressed_set)
    def __getitem__(self, k):
        return k in self._pressed

_pg_key = types.ModuleType('pygame.key')
_pg_key.get_pressed = lambda: _PgKeyState(json.loads(window.__tmGetKeysPressed()))

_pg_mouse = types.ModuleType('pygame.mouse')
_pg_mouse.get_pos = lambda: tuple(json.loads(window.__tmGetMousePos()))
_pg_mouse.get_pressed = lambda: tuple(json.loads(window.__tmGetMouseButtons()))

class _PgClock:
    def __init__(self):
        self._last = time.time()
    def tick(self, fps=60):
        now = time.time()
        dt = max(1, int((now - self._last) * 1000))
        self._last = now
        return dt
    def get_fps(self): return 60.0

_pg_time = types.ModuleType('pygame.time')
_pg_time.Clock = _PgClock
_pg_time.get_ticks = lambda: int((time.time() - _tm_boot_time) * 1000)
_pg_time.delay = lambda ms: None
_pg_time.wait = lambda ms: None
_tm_boot_time = time.time()

class _PgSprite:
    def __init__(self):
        self.image = None
        self.rect = _PgRect(0, 0, 16, 16)
    def update(self, *args, **kwargs): pass
    def kill(self): pass

class _PgGroup(list):
    def add(self, *sprites):
        for s in sprites:
            if s not in self:
                self.append(s)
    def remove(self, *sprites):
        for s in sprites:
            if s in self:
                super().remove(s)
    def update(self, *args, **kwargs):
        for s in list(self): s.update(*args, **kwargs)
    def draw(self, surf):
        for s in list(self):
            if s.image is not None and s.rect is not None:
                surf.blit(s.image, s.rect)
    def sprites(self): return list(self)

_pg_sprite = types.ModuleType('pygame.sprite')
_pg_sprite.Sprite = _PgSprite
_pg_sprite.Group = _PgGroup

_pg_mixer = types.ModuleType('pygame.mixer')
_pg_mixer.init = lambda *a, **kw: None
_pg_mixer.Sound = lambda *a, **kw: types.SimpleNamespace(play=lambda *a, **kw: window.__tmBeep(520, 0.06))

_pygame_mod.Surface = _PgSurface
_pygame_mod.Rect = _PgRect
_pygame_mod.Color = _PgColor
_pygame_mod.display = _pg_display
_pygame_mod.draw = _pg_draw
_pygame_mod.font = _pg_font
_pygame_mod.event = _pg_event
_pygame_mod.key = _pg_key
_pygame_mod.mouse = _pg_mouse
_pygame_mod.time = _pg_time
_pygame_mod.sprite = _pg_sprite
_pygame_mod.mixer = _pg_mixer
_pygame_mod.init = lambda: (6, 0)
_pygame_mod.quit = lambda: None
sys.modules['pygame'] = _pygame_mod
sys.modules['pygame.display'] = _pg_display
sys.modules['pygame.draw'] = _pg_draw
sys.modules['pygame.font'] = _pg_font
sys.modules['pygame.event'] = _pg_event
sys.modules['pygame.key'] = _pg_key
sys.modules['pygame.mouse'] = _pg_mouse
sys.modules['pygame.time'] = _pg_time
sys.modules['pygame.sprite'] = _pg_sprite
sys.modules['pygame.mixer'] = _pg_mixer

# ---- COOPERATIVE ASYNC GAME LOOP TRANSFORMER FOR PYGAME ----
class _TmLoopYieldTransformer(ast.NodeTransformer):
    def __init__(self):
        self.async_fns = set()
    def visit_While(self, node):
        self.generic_visit(node)
        sleep_stmt = ast.Expr(value=ast.Await(
            value=ast.Call(
                func=ast.Attribute(value=ast.Name(id='asyncio', ctx=ast.Load()), attr='sleep', ctx=ast.Load()),
                args=[ast.Constant(value=0.016)],
                keywords=[]
            )
        ))
        node.body.append(sleep_stmt)
        return node

def _tm_prepare_and_run_async_src(source_code):
    _tm_hook_matplotlib()
    has_pygame_loop = ('pygame' in source_code and 'while ' in source_code)
    if not has_pygame_loop:
        exec(compile(source_code, '<user>', 'exec'), globals())
        return None
    tree = ast.parse(source_code)
    # Convert functions containing a While loop into async def and await calls to them
    fn_with_loop = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef):
            if any(isinstance(sub, ast.While) for sub in ast.walk(node)):
                fn_with_loop.add(node.name)
    class _FnAsyncConverter(ast.NodeTransformer):
        def visit_While(self, node):
            self.generic_visit(node)
            node.body.append(ast.Expr(value=ast.Await(
                value=ast.Call(
                    func=ast.Attribute(value=ast.Name(id='asyncio', ctx=ast.Load()), attr='sleep', ctx=ast.Load()),
                    args=[ast.Constant(value=0.016)],
                    keywords=[]
                )
            )))
            return node
        def visit_FunctionDef(self, node):
            self.generic_visit(node)
            if node.name in fn_with_loop:
                return ast.AsyncFunctionDef(
                    name=node.name, args=node.args, body=node.body,
                    decorator_list=node.decorator_list, returns=node.returns, type_comment=node.type_comment
                )
            return node
        def visit_Call(self, node):
            self.generic_visit(node)
            if isinstance(node.func, ast.Name) and node.func.id in fn_with_loop:
                return ast.Await(value=node)
            return node
    new_tree = _FnAsyncConverter().visit(tree)
    ast.fix_missing_locations(new_tree)
    wrapped = ast.AsyncFunctionDef(
        name='__tm_async_entry__',
        args=ast.arguments(posonlyargs=[], args=[], kwonlyargs=[], kw_defaults=[], defaults=[]),
        body=new_tree.body,
        decorator_list=[],
        returns=None,
    )
    mod = ast.Module(body=[wrapped], type_ignores=[])
    ast.fix_missing_locations(mod)
    ns = dict(globals())
    exec(compile(mod, '<pygame_async>', 'exec'), ns)
    return ns['__tm_async_entry__']()
`;

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${entryFile.path}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; background: #0b0d12; color: #e4e4e7; font-family: system-ui, -apple-system, sans-serif; display: flex; flex-direction: column; overflow: hidden; }
    .topbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 12px; background: #11131a; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 12px; flex-shrink: 0; }
    .title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .controls { display: flex; align-items: center; gap: 6px; }
    button { background: rgba(255,255,255,0.08); color: #f4f4f5; border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer; }
    button:hover { background: rgba(255,255,255,0.15); }
    .stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; padding: 10px; overflow: auto; background: #090a0f; position: relative; }
    canvas { max-width: 100%; max-height: 100%; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); background: #09090b; outline: none; box-shadow: 0 8px 24px rgba(0,0,0,0.45); }
    #plot-img { max-width: 100%; max-height: 100%; border-radius: 8px; display: none; background: #fff; padding: 4px; }
    .status { font-size: 11px; color: #94a3b8; font-family: monospace; }
    .console { border-top: 1px solid rgba(255,255,255,0.1); background: #09090b; display: flex; flex-direction: column; flex-shrink: 0; transition: height 0.15s ease; }
    .console.expanded { height: 120px; }
    .console.minimized { height: 32px; }
    .console-bar { display: flex; align-items: center; justify-content: space-between; padding: 5px 10px; background: #11131a; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 11px; font-family: monospace; cursor: pointer; }
    .console-body { flex: 1; overflow-y: auto; padding: 6px 10px; font-family: monospace; font-size: 11px; line-height: 1.45; white-space: pre-wrap; }
    .log-err { color: #f87171; }
    .log-info { color: #94a3b8; }
    .log-ok { color: #34d399; }
  </style>
</head>
<body>
  <div class="topbar">
    <span class="title" id="win-title">${entryFile.path}</span>
    <div class="controls">
      <span class="status" id="run-status">Đang tải Python runtime...</span>
      <button type="button" id="btn-restart">Chạy lại</button>
    </div>
  </div>
  <div class="stage">
    <canvas id="tm-stage" width="640" height="440" tabindex="0"></canvas>
    <img id="plot-img" alt="Plot Output" />
  </div>
  <div class="console minimized" id="console-box">
    <div class="console-bar" id="console-toggle">
      <span id="console-summary">Console · Sẵn sàng</span>
      <span id="console-toggle-label">Mở rộng ▲</span>
    </div>
    <div class="console-body" id="console-body"></div>
  </div>

  <script src="https://cdn.jsdelivr.net/pyodide/v0.27.5/full/pyodide.js"></script>
  <script>
    const WORKSPACE_FILES = ${safeJson(workspaceTextFiles)};
    const ENTRY_CODE = ${safeJson(entryFile.content)};
    const PRELUDE = ${safeJson(pythonPrelude)};
    const canvas = document.getElementById('tm-stage');
    const ctx = canvas.getContext('2d');
    const plotImg = document.getElementById('plot-img');
    const statusEl = document.getElementById('run-status');
    const titleEl = document.getElementById('win-title');
    const consoleBox = document.getElementById('console-box');
    const consoleBody = document.getElementById('console-body');
    const consoleSummary = document.getElementById('console-summary');
    const consoleToggleLabel = document.getElementById('console-toggle-label');

    document.getElementById('console-toggle').onclick = () => {
      const min = consoleBox.classList.contains('minimized');
      consoleBox.classList.toggle('minimized', !min);
      consoleBox.classList.toggle('expanded', min);
      consoleToggleLabel.textContent = min ? 'Thu nhỏ ▼' : 'Mở rộng ▲';
    };

    window.__tmPushLog = (level, text) => {
      const line = String(text ?? '');
      const div = document.createElement('div');
      div.className = level === 'error' ? 'log-err' : level === 'info' ? 'log-info' : 'log-ok';
      div.textContent = line;
      consoleBody.appendChild(div);
      consoleBody.scrollTop = consoleBody.scrollHeight;
      consoleSummary.textContent = (level === 'error' ? 'Lỗi: ' : 'Console: ') + line.slice(0, 72);
      try {
        window.parent.postMessage({ type: '__TM_RUNNER_LOG__', level, text: line }, '*');
      } catch {}
    };

    window.__tmSetCaption = (t) => { titleEl.textContent = String(t || ''); };

    window.__tmInitCanvas = (w, h, title, bg) => {
      canvas.style.display = 'block';
      plotImg.style.display = 'none';
      canvas.width = w || 640;
      canvas.height = h || 440;
      if (title) titleEl.textContent = title;
      ctx.fillStyle = bg || '#09090b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      canvas.focus();
    };

    window.__tmShowPlotImage = (dataUrl) => {
      canvas.style.display = 'none';
      plotImg.src = dataUrl;
      plotImg.style.display = 'block';
      statusEl.textContent = 'Đã vẽ biểu đồ Matplotlib';
    };

    window.__tmTurtleBg = (bg) => {
      ctx.fillStyle = bg || '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    window.__tmTurtleClear = (bg) => {
      ctx.fillStyle = bg || '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };
    window.__tmTurtleLine = (x0, y0, x1, y1, color, w) => {
      ctx.save();
      ctx.strokeStyle = color || '#111827';
      ctx.lineWidth = w || 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.restore();
    };
    window.__tmTurtleFill = (ptsJson, color) => {
      const pts = JSON.parse(ptsJson);
      if (!pts.length) return;
      ctx.save();
      ctx.fillStyle = color || '#3b82f6';
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    window.__tmTurtleDot = (cx, cy, r, color) => {
      ctx.save();
      ctx.fillStyle = color || '#111827';
      ctx.beginPath();
      ctx.arc(cx, cy, r || 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    window.__tmTurtleText = (x, y, txt, color, size, font, align) => {
      ctx.save();
      ctx.fillStyle = color || '#111827';
      ctx.font = (size || 12) + 'px ' + (font || 'sans-serif');
      ctx.textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left';
      ctx.fillText(txt, x, y);
      ctx.restore();
    };
    window.__tmTurtleCursor = () => {};
    window.__tmRegisterKeyHandler = () => {};

    window.__tmPgFlush = (cmdsJson) => {
      const cmds = JSON.parse(cmdsJson);
      for (const c of cmds) {
        const op = c[0];
        if (op === 'fill') {
          ctx.fillStyle = c[1];
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else if (op === 'rect') {
          const [, col, x, y, w, h, lw] = c;
          if (!lw) { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }
          else { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.strokeRect(x, y, w, h); }
        } else if (op === 'circle') {
          const [, col, cx, cy, r, lw] = c;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          if (!lw) { ctx.fillStyle = col; ctx.fill(); }
          else { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke(); }
        } else if (op === 'line') {
          const [, col, x1, y1, x2, y2, lw] = c;
          ctx.strokeStyle = col;
          ctx.lineWidth = lw || 1;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        } else if (op === 'polygon') {
          const [, col, pts, closed, lw, filled] = c;
          if (!pts.length) continue;
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
          if (closed) ctx.closePath();
          if (filled) { ctx.fillStyle = col; ctx.fill(); }
          else { ctx.strokeStyle = col; ctx.lineWidth = lw || 1; ctx.stroke(); }
        } else if (op === 'ellipse') {
          const [, col, cx, cy, rx, ry, lw] = c;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          if (!lw) { ctx.fillStyle = col; ctx.fill(); }
          else { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke(); }
        } else if (op === 'text') {
          const [, txt, x, y, col, fsize, fname] = c;
          ctx.fillStyle = col;
          ctx.font = (fsize || 18) + 'px ' + (fname || 'sans-serif');
          ctx.textBaseline = 'top';
          ctx.fillText(txt, x, y);
        }
      }
    };

    const eventQueue = [];
    const pressedKeys = new Set();
    let mousePos = [0, 0];
    let mouseButtons = [false, false, false];
    const mapKeyCode = (e) => {
      if (e.key === 'ArrowUp') return 273;
      if (e.key === 'ArrowDown') return 274;
      if (e.key === 'ArrowRight') return 275;
      if (e.key === 'ArrowLeft') return 276;
      if (e.key === ' ') return 32;
      if (e.key === 'Enter') return 13;
      if (e.key === 'Escape') return 27;
      if (e.key && e.key.length === 1) return e.key.toLowerCase().charCodeAt(0);
      return e.keyCode || 0;
    };
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
      const k = mapKeyCode(e);
      pressedKeys.add(k);
      eventQueue.push({ type: 'keydown', key: k, unicode: e.key || '' });
    });
    window.addEventListener('keyup', (e) => {
      const k = mapKeyCode(e);
      pressedKeys.delete(k);
      eventQueue.push({ type: 'keyup', key: k });
    });
    const getCanvasPos = (e) => {
      const r = canvas.getBoundingClientRect();
      return [
        Math.round(((e.clientX - r.left) / Math.max(1, r.width)) * canvas.width),
        Math.round(((e.clientY - r.top) / Math.max(1, r.height)) * canvas.height),
      ];
    };
    canvas.addEventListener('mousemove', (e) => {
      mousePos = getCanvasPos(e);
      eventQueue.push({ type: 'mousemove', pos: mousePos });
    });
    canvas.addEventListener('mousedown', (e) => {
      canvas.focus();
      mousePos = getCanvasPos(e);
      mouseButtons[0] = true;
      eventQueue.push({ type: 'mousedown', pos: mousePos, button: e.button + 1 });
    });
    canvas.addEventListener('mouseup', (e) => {
      mousePos = getCanvasPos(e);
      mouseButtons[0] = false;
      eventQueue.push({ type: 'mouseup', pos: mousePos, button: e.button + 1 });
    });
    window.__tmDrainEvents = () => {
      const copy = eventQueue.splice(0, eventQueue.length);
      return JSON.stringify(copy);
    };
    window.__tmGetKeysPressed = () => JSON.stringify(Array.from(pressedKeys));
    window.__tmGetMousePos = () => JSON.stringify(mousePos);
    window.__tmGetMouseButtons = () => JSON.stringify(mouseButtons);
    window.__tmBeep = () => {};

    let pyodideInstance = null;
    async function bootAndRun() {
      consoleBody.innerHTML = '';
      eventQueue.length = 0;
      pressedKeys.clear();
      statusEl.textContent = 'Đang khởi chạy...';
      try {
        if (!pyodideInstance) {
          pyodideInstance = await loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.5/full/' });
        }
        try { pyodideInstance.FS.mkdir('/workspace'); } catch {}
        for (const f of WORKSPACE_FILES) {
          const clean = '/workspace/' + f.path;
          const dirs = clean.split('/').slice(1, -1);
          let cur = '';
          for (const d of dirs) {
            cur += '/' + d;
            try { pyodideInstance.FS.mkdir(cur); } catch {}
          }
          pyodideInstance.FS.writeFile(clean, f.content);
        }
        await pyodideInstance.runPythonAsync(PRELUDE);
        try {
          if (typeof pyodideInstance.loadPackagesFromImports === 'function') {
            await pyodideInstance.loadPackagesFromImports(ENTRY_CODE);
          }
        } catch {}
        statusEl.textContent = 'Đang chạy';
        window.__tm_user_src = ENTRY_CODE;
        await pyodideInstance.runPythonAsync(\`
coro = _tm_prepare_and_run_async_src(window.__tm_user_src)
if coro is not None:
    await coro
sys.stdout.flush()
sys.stderr.flush()
\`);
        statusEl.textContent = 'Hoàn tất';
      } catch (err) {
        statusEl.textContent = 'Có lỗi';
        window.__tmPushLog('error', String(err && err.message ? err.message : err));
        consoleBox.classList.remove('minimized');
        consoleBox.classList.add('expanded');
        consoleToggleLabel.textContent = 'Thu nhỏ ▼';
      }
    }
    document.getElementById('btn-restart').onclick = () => bootAndRun();
    bootAndRun();
  </script>
</body>
</html>`;
}

export function buildCanvasCommandsHtml(
  commands: CanvasDrawCommand[],
  title = 'Graphics Canvas'
): string {
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <style>
    html, body { margin: 0; height: 100%; background: #0b0d12; color: #f4f4f5; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: system-ui, sans-serif; }
    .cap { font-size: 11px; color: #94a3b8; margin-bottom: 6px; }
    canvas { max-width: 100%; max-height: calc(100% - 28px); background: #09090b; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12); }
  </style>
</head>
<body>
  <div class="cap">${title}</div>
  <canvas id="c" width="600" height="360"></canvas>
  <script>
    const cmds = ${safeJson(commands)};
    const c = document.getElementById('c');
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, c.width, c.height);
    let curColor = '#38bdf8';
    ctx.strokeStyle = curColor;
    ctx.fillStyle = curColor;
    ctx.lineWidth = 2;
    for (const cmd of cmds) {
      const a = cmd.args || [];
      if (cmd.op === 'clear') {
        ctx.fillStyle = String(a[0] || '#09090b');
        ctx.fillRect(0, 0, c.width, c.height);
      } else if (cmd.op === 'color') {
        curColor = String(a[0] || '#38bdf8');
        ctx.strokeStyle = curColor;
        ctx.fillStyle = curColor;
      } else if (cmd.op === 'lineWidth') {
        ctx.lineWidth = Number(a[0]) || 2;
      } else if (cmd.op === 'line') {
        ctx.beginPath();
        ctx.moveTo(Number(a[0]), Number(a[1]));
        ctx.lineTo(Number(a[2]), Number(a[3]));
        ctx.stroke();
      } else if (cmd.op === 'rect') {
        ctx.strokeRect(Number(a[0]), Number(a[1]), Number(a[2]), Number(a[3]));
      } else if (cmd.op === 'fillRect') {
        ctx.fillRect(Number(a[0]), Number(a[1]), Number(a[2]), Number(a[3]));
      } else if (cmd.op === 'circle') {
        ctx.beginPath();
        ctx.arc(Number(a[0]), Number(a[1]), Number(a[2]), 0, Math.PI * 2);
        ctx.stroke();
      } else if (cmd.op === 'fillCircle') {
        ctx.beginPath();
        ctx.arc(Number(a[0]), Number(a[1]), Number(a[2]), 0, Math.PI * 2);
        ctx.fill();
      } else if (cmd.op === 'oval') {
        ctx.beginPath();
        ctx.ellipse(Number(a[0]) + Number(a[2]) / 2, Number(a[1]) + Number(a[3]) / 2, Math.abs(Number(a[2]) / 2), Math.abs(Number(a[3]) / 2), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (cmd.op === 'fillOval') {
        ctx.beginPath();
        ctx.ellipse(Number(a[0]) + Number(a[2]) / 2, Number(a[1]) + Number(a[3]) / 2, Math.abs(Number(a[2]) / 2), Math.abs(Number(a[3]) / 2), 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (cmd.op === 'text') {
        ctx.font = (Number(a[3]) || 14) + 'px sans-serif';
        ctx.fillText(String(a[0] || ''), Number(a[1]), Number(a[2]));
      }
    }
  </script>
</body>
</html>`;
}

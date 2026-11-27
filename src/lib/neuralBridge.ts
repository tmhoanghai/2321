import { AIMode, Language } from "@/types";

export interface ImplicitVisualIntent {
  preferChart: boolean;
  preferSpreadsheet: boolean;
  preferModel3D?: boolean;
  suppressVisuals: boolean;
  reason: 'code_or_folder' | 'explicit_or_implicit_math_data' | 'explicit_or_implicit_sheet' | 'explicit_or_implicit_3d_4d' | 'plain_qa';
}

export function classifyImplicitVisualIntent(prompt: string): ImplicitVisualIntent {
  const raw = String(prompt || '').trim();
  const lower = raw.toLowerCase();

  if (!raw) {
    return { preferChart: false, preferSpreadsheet: false, preferModel3D: false, suppressVisuals: true, reason: 'plain_qa' };
  }

  const hasDebugKeyword =
    /(?:^|[\s,.;:!?("'“])(fix\s+lỗi|sửa\s+lỗi|sửa\s+code|debug|refactor|bug|stack\s*trace|typeerror|syntaxerror|referenceerror|compiler\s+error)(?=$|[\s,.;:!?)”"'])/i.test(
      lower
    );

  const hasAlgoKeyword =
    /(?:^|[\s,.;:!?("'“])(bfs|dfs|breadth[\s-]*first|depth[\s-]*first|binary\s+search|tìm\s+kiếm\s+nhị\s+phân|dijkstra|two\s+pointers|hai\s+con\s+trỏ|duyệt\s+đồ\s+thị|lập\s+trình\s+thi\s+đấu|competitive\s+programming|thuật\s+toán\s+tìm\s+kiếm)(?=$|[\s,.;:!?)”"'])/i.test(
      lower
    );

  const hasTeachingOrVisualVerb =
    /(?:^|[\s,.;:!?("'“])(vẽ|minh\s+họa|ví\s+dụ|dạy|giảng|mô\s+phỏng|từng\s+bước|trực\s+quan|visualize|trace|step[\s-]*by[\s-]*step)(?=$|[\s,.;:!?)”"'])/i.test(
      lower
    );

  const hasBigOOrFlowKeyword =
    /(?:^|[\s,.;:!?("'“])(big[\s-]*o|độ\s+phức\s+tạp|time\s+complexity|o\(n\^?2\)|o\(log\s*n\)|o\(n\s*log\s*n\)|o\(2\^?n\)|flowchart|sơ\s+đồ\s+luồng|lưu\s+đồ|luồng\s+dữ\s+liệu|quy\s+trình\s+xử\s+lý)(?=$|[\s,.;:!?)”"'])/i.test(
      lower
    );

  const explicitAlgorithmVisual = !hasDebugKeyword && (hasAlgoKeyword || hasBigOOrFlowKeyword) && hasTeachingOrVisualVerb;

  const explicitTimeGraphRequest =
    /(?:^|[\s,.;:!?("'“])(time\s*graph|time[\s_-]*series|đồ\s+thị\s+thời\s+gian|đồ\s+thị\s+vận\s+tốc|đồ\s+thị\s+quãng\s+đường|đồ\s+thị\s+chuyển\s+động|vận\s+tốc[\s,/-]+quãng\s+đường|time[\s,/-]+speed[\s,/-]+distance)(?=$|[\s,.;:!?)”"'])/i.test(
      lower
    );

  const explicitChartRequest =
    explicitAlgorithmVisual ||
    explicitTimeGraphRequest ||
    /(?:^|[\s,.;:!?("'“])(vẽ\s+(?:biểu\s+đồ|đồ\s+thị|sơ\s+đồ|chart|bản\s+đồ|lộ\s+trình|lưu\s+đồ)|biểu\s+đồ|sơ\s+đồ\s+nến|biểu\s+đồ\s+nến|sơ\s+đồ\s+luồng|lưu\s+đồ|flowchart|big[\s-]*o|so\s+sánh\s+độ\s+phức\s+tạp|vẽ\s+nến|lộ\s+trình|roadmap|timeline|recharts|ddos|sankey|gantt|candlestick|choropleth|treemap|sunburst|histogram|boxplot|violin)(?=$|[\s,.;:!?)”"'])/i.test(
      lower
    );

  const explicitSheetRequest =
    /\b(bảng\s+tính|spreadsheet|excel|công\s+thức\s+ô|=sum\(|=average\()\b/i.test(lower);

  const isMathAxisPrompt =
    /\b(parabol(?:oid)?|đồ\s+thị\s+hàm|hệ\s+trục\s+tọa\s+độ|oxyz?|khảo\s+sát\s+(?:hàm|và\s+vẽ)|cực\s+trị|tiệm\s+cận|vector\s+[a-z]|tích\s+có\s+hướng|mặt\s+cong|tích\s+phân|nguyên\s+hàm|riemann|integral|∫)\b/i.test(lower) ||
    /(?:^|[\s,(])[yz]\s*=\s*[-+0-9a-zA-Z^*/().\s]*[xt]/i.test(raw);

  const isStandaloneModel3DOr4D =
    !isMathAxisPrompt &&
    (/(?:mô\s+hình\s+3d|thiết\s+kế\s+3d|mô\s+hình\s+thiết\s+kế|kiến\s+trúc\s+3d|vẽ\s+(?:theo|từ)\s+ảnh|image[\s-]*to[\s-]*3d|wireframe|tesseract|hypercube|16[\s-]*cell|5[\s-]*cell|duoprism|clifford\s+torus|đa\s+diện\s+4d|chiều\s+thứ\s+4|penteract|5[\s-]*cube|5[\s-]*simplex|5[\s-]*orthoplex|pentacross|hexateron|demipenteract|5torus|5\s*chiều|chiều\s+thứ\s+5)/i.test(lower) ||
      /(?:vẽ|tạo|dựng|thiết\s+kế).{0,40}\b(?:3d|4d|5d)\b/i.test(lower));

  const isCodeOrDebugTask =
    !explicitChartRequest &&
    !explicitSheetRequest &&
    !isStandaloneModel3DOr4D &&
    /\b(fix\s+lỗi|sửa\s+lỗi|sửa\s+code|debug|refactor|bug\b|stack\s*trace|typeerror|syntaxerror|referenceerror|compiler|typescript|javascript|react|vue|html|css|python|java|c\+\+|folder|thư\s+mục|filename:|viết\s+(?:hàm|code|app|web|component|script|game)|pygame|turtle)\b/i.test(
      lower
    );

  if (isCodeOrDebugTask) {
    return { preferChart: false, preferSpreadsheet: false, preferModel3D: false, suppressVisuals: true, reason: 'code_or_folder' };
  }

  if (isStandaloneModel3DOr4D) {
    return {
      preferChart: false,
      preferSpreadsheet: false,
      preferModel3D: true,
      suppressVisuals: false,
      reason: 'explicit_or_implicit_3d_4d',
    };
  }

  const implicitMathOrCurve = isMathAxisPrompt;

  const implicitDataVisual =
    /\b(so\s+sánh\s+(?:doanh\s+thu|tăng\s+trưởng|thị\s+phần|dân\s+số|gdp|giá|lợi\s+nhuận|tỷ\s+lệ)|xu\s+hướng\s+(?:tăng|giảm|biến\s+động)|thống\s+kê\s+theo\s+(?:tháng|quý|năm|tuần|khu\s+vực|tỉnh|quốc\s+gia)|cơ\s+cấu\s+(?:doanh\s+thu|chi\s+phí|thị\s+phần)|phân\s+bố\s+(?:điểm|tuổi|thu\s+nhập)|tiến\s+độ\s+dự\s+án|lộ\s+trình\s+(?:học|dự\s+án|triển\s+khai)|luồng\s+(?:tiền|người\s+dùng|dữ\s+liệu)|tương\s+quan\s+giữa)\b/i.test(
      lower
    );

  const implicitSpreadsheet =
    explicitSheetRequest ||
    /\b(dự\s+toán|lập\s+ngân\s+sách|quản\s+lý\s+chi\s+tiêu|chi\s+tiêu\s+(?:hàng\s+)?tháng|bảng\s+lương|tính\s+lương|bảng\s+điểm|tính\s+(?:điểm\s+trung\s+bình|gpa)|tính\s+(?:tổng\s+chi\s+phí|doanh\s+thu\s+và\s+lợi\s+nhuận|tiền\s+điện|lãi\s+kép|lịch\s+trả\s+nợ|trả\s+góp)|hóa\s+đơn\s+gồm|kế\s+hoạch\s+tài\s+chính)\b/i.test(
      lower
    );

  const preferChart = explicitChartRequest || implicitMathOrCurve || implicitDataVisual;
  const preferSpreadsheet = implicitSpreadsheet && !explicitChartRequest;

  if (preferSpreadsheet && !preferChart) {
    return {
      preferChart: false,
      preferSpreadsheet: true,
      preferModel3D: false,
      suppressVisuals: false,
      reason: 'explicit_or_implicit_sheet',
    };
  }

  if (preferChart) {
    return {
      preferChart: true,
      preferSpreadsheet,
      preferModel3D: false,
      suppressVisuals: false,
      reason: 'explicit_or_implicit_math_data',
    };
  }

  return { preferChart: false, preferSpreadsheet: false, preferModel3D: false, suppressVisuals: true, reason: 'plain_qa' };
}

export function detectDetectiveIntent(prompt: string): boolean {
  const raw = String(prompt || '').trim();
  if (!raw) return false;
  return /(?:^|[\s,.;:!?("'“])(trinh\s+thám|điều\s+tra|phá\s+án|vụ\s+án|hung\s+thủ|nghi\s+phạm|manh\s+mối|chứng\s+cứ|ngoại\s+phạm|hiện\s+trường|lời\s+khai|giải\s+mã\s+bí\s+ẩn|câu\s+đố\s+trinh\s+thám|suy\s+luận\s+phá\s+án|osint|forensic|detective|sherlock|culprit|suspect|alibi|clue|whodunit|deduce|murder\s+mystery|cold\s+case|crime\s+scene|investigate)(?=$|[\s,.;:!?)”"'])/i.test(
    raw
  );
}

export function getSystemPrompt(mode: AIMode, language: Language, profile: string, summary: string, isEcoMode: boolean, iqLevel: number = 1) {
  const now = new Date();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Ho_Chi_Minh';
  const dateUS = now.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const dateVN = now.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeNow = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

  let prompt = `BẢN SẮC: Bạn là TheMaster — trợ lý thông minh, tự nhiên, chính xác và phản hồi nhanh gọn.
THỜI GIAN HỆ THỐNG CHÍNH XÁC HIỆN TẠI:
- Ngày (MM/DD/YYYY): ${dateUS}
- Ngày đầy đủ: ${dateVN}
- Giờ hiện tại: ${timeNow} (${timeZone})
- ISO: ${now.toISOString()}
Khi người dùng hỏi về ngày, giờ, năm hiện tại hoặc thông tin thời sự, LUÔN dùng chính xác mốc thời gian trên (${dateUS}, ${timeNow}) và tuyệt đối không bịa đặt.

GIAO TIẾP & BẢO MẬT CHỦ SỞ HỮU:
- Trả lời tự nhiên, đi thẳng vào trọng tâm, súc tích, không sáo rỗng hay lặp khuôn máy móc.
- Chủ sở hữu & người sáng tạo duy nhất của TheMaster là **TMkingreal** (cũng có thể gọi là **king**).
- QUY TẮC BẢO MẬT TUYỆT ĐỐI: KHÔNG BAO GIỜ tiết lộ tên thật, tuổi, năm sinh, ngày sinh, nơi ở, trường học, email hay thông tin cá nhân của chủ sở hữu. Khi được hỏi về chủ sở hữu/người tạo ra bạn, CHỈ được nói là **TMkingreal** (hoặc **king**).
- LUÔN suy nghĩ (luồng suy luận) và trả lời bằng ngôn ngữ được chọn: ${language}.

NĂNG LỰC LẬP TRÌNH CHUYÊN SÂU & CHẠY ĐƯỢC TRONG FOLDER:
- Viết mã nguồn hoàn chỉnh 100%, chạy được ngay, chuẩn xác từng import/type/export/edge-case. TUYỆT ĐỐI KHÔNG cắt ngắn bằng // ..., /* ... */, // TODO hay bỏ dở file.
- Khi viết web/app React/TS/JS nhiều file hoặc sửa code trong folder:
  1) Đặt dòng \`FILENAME: duong_dan/ten_file.ext\` (không bọc dấu nháy/backtick) ngay trước MỖI khối mã. Đường dẫn phải khớp CHÍNH XÁC với đường dẫn sẵn có trong cây thư mục (ví dụ \`src/App.tsx\`, \`src/components/Header.tsx\`). KHI CÓ WORKSPACE: LUÔN xuất khối \`FILENAME:\` để sửa trực tiếp, TUYỆT ĐỐI KHÔNG chỉ giải thích bằng lời.
  2) Kiểm tra chéo mọi import tương đối (\`./...\`, \`../...\`, \`@/...\`) phải khớp 100% đường dẫn tệp và đúng loại export (default vs named — tránh lỗi \`... is not a function\`); mọi component React dùng làm entry (\`App.tsx\` / \`main.tsx\`) phải có \`export default\` và khớp DOM \`#root\`.
  3) Luôn kiểm tra kiểu dữ liệu trước khi gọi method (như \`Array.isArray(x)\` trước \`.map/.filter\`, kiểm tra callback/function tồn tại trước khi gọi) để không gây lỗi runtime \`is not a function\` hoặc \`Cannot read properties of undefined\`.
  4) Trong React (\`.tsx\`/\`.jsx\`), LUÔN import tường minh mọi hook đang dùng (\`import { useState, useEffect, ... } from 'react'\`); CẤM đặt cú pháp TypeScript (\`interface\`, \`type\`, \`useState<T>\`, \`: string\`) trong file \`.js\`/\`.jsx\`.
  5) Không dùng thư viện Node.js (\`fs\`, \`path\`, \`child_process\`) trong code frontend trình duyệt; không phá hỏng tính năng đang chạy; thiết kế UI sạch, tối giản, dễ dùng trên cả điện thoại, iPad và máy tính.

CHUYÊN MÔN DỊCH THUẬT CHUYÊN SÂU (TIẾNG VÙNG MIỀN, HÁN-VIỆT, CỔ NGỮ & NGÔN NGỮ HIẾM):
- Khi người dùng yêu cầu dịch, giải nghĩa hoặc chuyển ngữ các ngôn ngữ khó, hãy xử lý chính xác và có chiều sâu ngôn ngữ học:
  1) **Tiếng vùng miền & phương ngữ / tiếng lóng** (phương ngữ Bắc/Trung/Huế/Nghệ An-Hà Tĩnh/Quảng Nam/Nam Bộ/Tây Nam Bộ; Quảng Đông 粵語, Mân Nam/Phúc Kiến, Tứ Xuyên, Kansai-ben, Tohoku-ben, phương ngữ Anh/Pháp/Tây Ban Nha bản địa...): nhận diện đúng ngữ cảnh địa phương, sắc thái cảm xúc/xưng hô, tránh dịch word-by-word sai nghĩa.
  2) **Hán-Việt, Chữ Hán (繁/簡) & Chữ Nôm (𡨸喃)**: đọc chuẩn âm Hán-Việt, phân tích chiết tự/gốc từ từng chữ hoặc điển tích, phân biệt nghĩa cổ với nghĩa hiện đại (false friends) và chuyển sang tiếng Việt tự nhiên chuẩn văn phong.
  3) **Cổ ngữ, ngôn ngữ cổ điển & ngôn ngữ hiếm / dân tộc ít người** (Văn ngôn 文言文, Latin cổ điển, Hy Lạp cổ, Sanskrit Phạn ngữ, Pali, Cổ ngữ Bắc Âu Old Norse, Anh cổ Old English, Ai Cập cổ/Coptic, Khmer cổ, Chăm, Thái, Mường, Tày-Nùng, H'Mông...): ghi rõ bản dịch mạch lạc + phiên âm/chuyển tự Latin (nếu khác chữ cái) + chú giải ngữ pháp/từ vựng đặc biệt.
- Định dạng trình bày rõ ràng, gọn gàng: (a) **Bản dịch chuẩn**, (b) **Phiên âm / Âm Hán-Việt** (nếu áp dụng), (c) **Chú giải ngữ cảnh & sắc thái**.

QUY CHUẨN TẠO FILE & CÂY THƯ MỤC (HỆ THỐNG TỰ ĐỘNG ĐÓNG GÓI TẢI VỀ):
1. TẠO FILE WORD (.docx):
   Viết dòng FILENAME: ten_tai_lieu.docx ngay trước khối mã \`\`\`markdown ... \`\`\` chứa nội dung trình bày đầy đủ (tiêu đề #, ##, ###, danh sách, bảng).
   CHÈN ẢNH VÀO WORD: Nếu người dùng gửi ảnh (có IMAGE_ID dạng attach://...) hoặc gửi link ảnh (https://...), hãy chèn trực tiếp vào nội dung markdown bằng cú pháp \`![Mô tả ảnh](url_hoặc_attach://id)\`. Hệ thống sẽ tự động nhúng ảnh thật vào file .docx.
2. TẠO FILE POWERPOINT (.pptx):
   Viết dòng FILENAME: ten_trinh_chieu.pptx ngay trước khối mã \`\`\`pptx ... \`\`\` chứa JSON hợp lệ theo cấu trúc:
   {"title":"Tiêu đề chính","subtitle":"Phụ đề","slides":[{"title":"Tiêu đề slide","bullets":["Ý 1","Ý 2"],"image":"url_hoặc_attach://id","notes":"Ghi chú"}]}
   CHÈN ẢNH VÀO SLIDE: Thêm trường "image" (tùy chọn) với đường dẫn link ảnh người dùng gửi hoặc attach://id của ảnh đính kèm để hệ thống nhúng ảnh trực tiếp vào slide .pptx và xem trước.
3. TẠO FILE PDF (.pdf):
   Viết dòng FILENAME: ten_tai_lieu.pdf ngay trước khối mã \`\`\`markdown ... \`\`\` chứa nội dung.
4. TỰ ĐỘNG SỬA CODE VÀO FOLDER, HIỆN QUY TRÌNH TẠO/SỬA/XÓA TỆP & TẢI ZIP (.zip):
   Khi người dùng có folder dự án đang mở, yêu cầu fix lỗi hoặc tạo web/app chạy thử:
   - Đặt dòng \`FILENAME: duong_dan/ten_file.ext\` ngay trước MỖI khối mã tạo mới hoặc chỉnh sửa (ví dụ \`FILENAME: index.html\`, \`FILENAME: src/App.tsx\`).
   - Khi cần XÓA tệp thừa/cũ trong dự án, viết dòng \`DELETE_FILE: duong_dan/ten_file.ext\` để hệ thống tự xóa tệp và hiển thị thẻ quy trình Tạo / Sửa / Xóa tệp trực tiếp trong khung chat.
   KIỂM TRA CHẤT LƯỢNG CODE TRƯỚC KHI XUẤT (BẮT BUỘC):
   - Viết code hoàn chỉnh 100%, CẤM dùng comment giữ chỗ \`// ...\`, \`/* ... */\`, \`# ...\`, \`TODO\`.
   - CẤM đặt cú pháp TypeScript (interface, type, useState<T>) trong file .js/.jsx.
   - Đảm bảo khớp 100% dấu ngoặc \`()[]{}\`, thẻ đóng/mở JSX, đường dẫn import tương đối/export symbol tồn tại, import đầy đủ React hooks đang dùng và có \`export default\` cho React component chính.
5. TỰ ĐỘNG NHẬN BIẾT KHI NÀO CẦN TẠO BẢNG TÍNH (\`spreadsheet\`) VS BẢNG MARKDOWN VS KHÔNG TẠO BẢNG:
   - **TỰ ĐỘNG xuất khối \`\`\`spreadsheet ... \`\`\`** (dù người dùng KHÔNG gõ chữ "bảng tính" hay "excel") khi bài toán cần **tính toán nhiều dòng/cột** như: lập dự toán chi phí, quản lý ngân sách/chi tiêu, doanh thu & lợi nhuận, bảng lương, bảng điểm GPA, lịch trả góp/lãi suất, hóa đơn có tổng/trung bình.
     Cấu trúc JSON chuẩn:
     \`{"title":"Tiêu đề bảng tính","columns":["Hạng mục","Số lượng","Đơn giá","Thành tiền"],"rows":[["Sản phẩm A","2","150000","=B1*C1"],["Tổng cộng","=SUM(B1:B1)","—","=SUM(D1:D1)"]]}\`
     Hỗ trợ đầy đủ \`=SUM(...)\`, \`=AVERAGE(...)\`, \`=MIN(...)\`, \`=MAX(...)\`, \`=COUNT(...)\`, \`=MEDIAN(...)\`, \`=ROUND(...)\`, \`=IF(...)\` và tham chiếu ô \`A1\`, \`B2\`.
   - Dùng bảng Markdown GFM (\`| Cột 1 | Cột 2 |\`) khi chỉ so sánh thông tin chữ/liệt kê tĩnh, không có công thức tính toán.
   - **KHÔNG** xuất \`spreadsheet\` cho hỏi đáp ngắn, sửa code, giải thích khái niệm, dịch thuật.
6. VẼ CÂY THƯ MỤC (DIRECTORY TREE):
   Khi người dùng gửi thư mục hoặc yêu cầu vẽ cây thư mục / cấu trúc dự án, LUÔN đặt cây thư mục trong khối mã ngôn ngữ \`\`\`tree ... \`\`\` sử dụng ký tự chuẩn ├── , └── , │   để hệ thống hiển thị trong khung cây thư mục chuyên dụng.
7. TỰ ĐỘNG NHẬN BIẾT KHI NÀO CẦN VẼ BIỂU ĐỒ (\`recharts\`), BẢNG/LỘ TRÌNH, MÔ HÌNH 3D/4D/5D (\`model3d\`) & KHI NÀO KHÔNG CẦN:
   - **TÁCH BIỆT TUYỆT ĐỐI**:
     • Khi vẽ **biểu đồ dữ liệu / bảng / lộ trình** (\`bar\`, \`line\`, \`pie\`, \`gantt\`, \`roadmap\`, \`sankey\`, ...), **TUYỆT ĐỐI KHÔNG** vẽ đồ thị hàm số/hệ trục tọa độ (\`coordinate_2d\`, \`surface_3d\`).
     • Khi vẽ **mô hình 3D thiết kế, vật thể, kiến trúc, đa diện 4D/5D hoặc dựng 3D từ ảnh**: **KHÔNG vẽ trên hệ trục tọa độ toán học $Oxyz$** mà dùng khối mã riêng \`\`\`model3d ... \`\`\` để hiển thị trong không gian studio Three.js độc lập (hỗ trợ xoay, zoom, Wireframe Toggle, thanh trượt Metalness/Roughness/Emission/Opacity và Physics Inspector).
   - **CẤU TRÚC KHỐI \`\`\`model3d ... \`\`\`**:
     1) **Mô hình 3D thiết kế / Kiến trúc / Sản phẩm (\`design_3d\` / \`architecture_3d\` / \`object_3d\`)**: lắp ghép nhiều bộ phận (\`box\`, \`sphere\`, \`cylinder\`, \`cone\`, \`torus\`, \`torusKnot\`, \`octahedron\`, \`icosahedron\`, \`dodecahedron\`, \`capsule\`, \`lathe\`, \`tube\`) kèm \`position\`, \`rotation\`, \`scale\`, \`size\`, \`color\`, \`metalness\`, \`roughness\`, \`opacity\`, \`mass\`, \`velocity\`:
        \`{"title":"Ghế công thái học 3D","category":"design_3d","parts":[{"id":"seat","label":"Đệm ngồi","type":"box","position":[0,0.9,0],"size":[1.3,0.14,1.25],"color":"#334155","metalness":0.2,"roughness":0.6,"mass":3.2,"velocity":[0,0,0]}]}\`
     2) **Mô hình 4D & 5D đa diện (\`shape_4d\` / \`shape_5d\`)**:
        • 4D hỗ trợ \`tesseract\`, \`16cell\`, \`5cell\`, \`duoprism\`, \`clifford_torus\`:
          \`{"title":"Khối Tesseract 4D","category":"shape_4d","model4d":{"shape":"tesseract","size":1.4,"distance4d":2.8,"edgeColor":"#38bdf8","vertexColor":"#f8fafc"},"autoRotate":true}\`
        • 5D (chiếu phối cảnh 5D→4D→3D) hỗ trợ \`penteract\`, \`5orthoplex\`, \`5simplex\`, \`demipenteract\`, \`5torus\`:
          \`{"title":"Khối Penteract 5D","category":"shape_5d","model5d":{"shape":"penteract","size":1.35,"distance5d":3.4,"distance4d":3.1,"edgeColor":"#a78bfa","vertexColor":"#f8fafc"},"autoRotate":true}\`
     3) **Dựng mô hình 3D theo ảnh đính kèm (\`image_3d\`)**: khi người dùng gửi ảnh (có \`attach://id\`) và yêu cầu dựng mô hình 3D/wireframe/thiết kế từ ảnh, xuất:
        \`{"title":"Mô hình 3D trích xuất từ ảnh","category":"image_3d","image":"attach://IMAGE_ID","wireframe":false}\`
        (Hoặc nếu người dùng gửi ảnh vật thể cụ thể như tòa nhà/xe/ghế và muốn mô hình CAD lắp ghép nhiều khối theo thiết kế ảnh đó, hãy dựng bằng \`design_3d\` với mảng \`parts\` khớp tỷ lệ & màu sắc thực tế trong ảnh!).
   - **VẼ BẢNG & LỘ TRÌNH**:
     • Lộ trình triển khai / học tập / kế hoạch dự án theo thời gian → dùng \`\`\`recharts {"type":"gantt", ...}\`\`\` hoặc \`\`\`mermaid gantt ...\`\`\` kết hợp bảng Markdown GFM tổng hợp các giai đoạn.
   - **TỰ ĐỘNG vẽ ngay khối \`\`\`recharts ... \`\`\`** nếu câu hỏi có bản chất trực quan sau:
     1) **Khảo sát hàm số, phương trình đường cong, tích phân xác định, vector, hình học tọa độ**:
        • Tích phân & tổng Riemann / diện tích hình phẳng giữa hai đường: dùng \`"type":"integral"\` kèm \`functions\`, \`bounds:[a,b]\`, \`slices:16\`, \`riemannMethod:"continuous"|"left"|"right"|"midpoint"|"trapezoid"\` (ví dụ: \`{"type":"integral","title":"Tích phân x² từ 0 đến 3","functions":[{"expr":"x^2","label":"f(x)=x²"}],"bounds":[0,3],"xRange":[-1,4],"slices":16,"riemannMethod":"midpoint"}\`).
        • Hàm số, parabol, sin/cos, mặt 3D $z = f(x,y)$, vector trong $Oxy$/$Oxyz$ → vẽ \`coordinate_2d\`, \`vector_2d\`, \`surface_3d\`, \`vector_3d\` hoặc \`parametric_3d\`. Có thể truyền nhiều hàm vào \`"functions":[...]\` hoặc nhiều vector vào \`"vectors":[...]\` để vẽ cùng lúc trên 1 đồ thị.
     2) **Đồ thị thời gian & Vật lý chuyển động (\`time_graph\`) — CHÍNH XÁC TUYỆT ĐỐI VỀ TIME / SPEED / DISTANCE**:
        • Khi vẽ đồ thị theo thời gian, bài toán vận tốc–quãng đường–thời gian ($s$-$t$, $v$-$t$, $a$-$t$) hoặc nhiều xe / nhiều đường trong cùng 1 đồ thị: dùng \`"type":"time_graph"\`.
        • ƯU TIÊN dùng mảng \`"objects"\` để engine tự tính chính xác $v(t)=v_0+a\\Delta t$, $s(t)=s_0+v_0\\Delta t+\\frac{1}{2}a(\\Delta t)^2$ và điểm gặp nhau:
          \`{"type":"time_graph","title":"Chuyển động Xe A & Xe B","timeUnit":"h","speedUnit":"km/h","distanceUnit":"km","objects":[{"name":"Xe A","startTime":0,"startDistance":0,"phases":[{"duration":4,"v0":40,"a":0}]},{"name":"Xe B","startTime":1,"startDistance":0,"phases":[{"duration":3,"v0":60,"a":0}]}]}\`
        • Nếu dùng mảng \`"data":[{"time":0,"speed":0,"distance":0},...]\`, phải đảm bảo $s(t) = \\int v(t)\\,dt$ nhất quán đơn vị (\`timeUnit\`, \`speedUnit\`, \`distanceUnit\`). Muốn vẽ nhiều đại lượng trong 1 đồ thị, liệt kê đầy đủ trong \`"series":[...]\`.
     3) **Dạy Thuật toán & Lập trình thi đấu (\`algorithm_trace\`) — VÍ DỤ ĐÚNG 100% TỪNG BƯỚC**:
        • Khi giảng dạy hoặc minh họa ví dụ cho **BFS, DFS, BFS vs DFS, Binary Search, Dijkstra, Two Pointers** (trong lập trình thi đấu / cấu trúc dữ liệu & giải thuật), LUÔN xuất khối \`\`\`recharts ...\`\`\` với \`"type":"algorithm_trace"\` để người dùng bấm Play / từng bước xem Queue, Stack, Distance, \`L/mid/R\` chính xác tuyệt đối:
          - Đồ thị (\`bfs\`, \`dfs\`, \`bfs_vs_dfs\`, \`dijkstra\`): \`{"type":"algorithm_trace","algorithm":"bfs_vs_dfs","title":"So sánh BFS & DFS từ đỉnh 1","directed":false,"start":"1","target":"6","nodes":[{"id":"1"},{"id":"2"},{"id":"3"},{"id":"4"},{"id":"5"},{"id":"6"}],"edges":[["1","2"],["1","3"],["2","4"],["2","5"],["3","6"]]}\` (Dijkstra thêm trọng số \`["1","2",4]\`).
          - Mảng (\`binary_search\`, \`two_pointers\`): \`{"type":"algorithm_trace","algorithm":"binary_search","title":"Binary Search tìm 23","array":[2,5,8,12,16,23,38,56,72],"target":23}\`.
        • Đảm bảo input ví dụ đúng chuẩn (mảng Binary Search phải đã sắp xếp tăng dần; đồ thị liên thông rõ ràng với đỉnh bắt đầu hợp lệ) và khớp với lời giải thích / code đính kèm.
      4) **So sánh độ phức tạp thời gian Big O (\`big_o\`)**:
         • Khi so sánh hoặc minh họa sự tăng trưởng thuật toán khi $n$ lớn ($O(1)$, $O(\\log n)$, $O(\\sqrt{n})$, $O(n)$, $O(n \\log n)$, $O(n^2)$, $O(n^3)$, $O(2^n)$), xuất khối \`\`\`recharts ...\`\`\` với \`"type":"big_o"\`:
           \`{"type":"big_o","title":"So sánh độ phức tạp thuật toán (Big O)","complexities":["O(1)","O(log n)","O(n)","O(n log n)","O(n^2)"],"nMax":100,"yScale":"linear"}\` (có thể bật \`"yScale":"log"\` nếu có \`O(2^n)\` hoặc \`nMax\` lớn).
      5) **Sơ đồ luồng dữ liệu / quy trình thuật toán (\`flowchart\`)**:
         • Khi giải thích quy trình xử lý, luồng dữ liệu hoặc thuật toán rẽ nhánh/vòng lặp cần bấm từng khối xem giải thích, xuất khối \`\`\`recharts ...\`\`\` với \`"type":"flowchart"\` gồm \`nodes\` (\`kind\`: \`"start"|"process"|"decision"|"io"|"end"\`, \`label\`, \`description\`, \`codeHint\`, \`complexity\`) và \`edges\` (\`from\`, \`to\`, \`label\`, \`isBackEdge\`):
           \`{"type":"flowchart","title":"Luồng xử lý Binary Search","nodes":[{"id":"s","label":"Bắt đầu","kind":"start","description":"Khởi tạo đầu vào"},{"id":"c","label":"left <= right ?","kind":"decision","description":"Kiểm tra điều kiện lặp"},{"id":"p","label":"Kiểm tra mid","kind":"process","description":"So sánh arr[mid] với target"},{"id":"e","label":"Trả kết quả","kind":"end","description":"Hoàn tất O(log n)"}],"edges":[{"from":"s","to":"c"},{"from":"c","to":"p","label":"Đúng"},{"from":"p","to":"c","label":"Lặp","isBackEdge":true},{"from":"c","to":"e","label":"Sai"}]}\`.
      6) **So sánh số liệu nhiều hạng mục, xếp hạng, xu hướng qua các mốc thời gian, cơ cấu tỷ trọng %, phân bố thống kê, tiến độ/lộ trình, luồng dữ liệu/tiền** → tự chọn loại biểu đồ phù hợp nhất trong 31+ loại bên dưới (có thể vẽ nhiều chuỗi bằng \`"series":[...]\` trong 1 đồ thị).
      7) **Giá cổ phiếu/crypto/vàng/forex & điểm mua/bán** → dùng \`\`\`tradingview ... \`\`\`.
   - **KHÔNG ĐƯỢC vẽ biểu đồ** khi người dùng chỉ đang: hỏi đáp khái niệm/định nghĩa ngắn, dịch ngôn ngữ, nhờ viết/sửa/debug code trong folder, hỏi câu chỉ cần 1–2 con số đơn lẻ hoặc trò chuyện thông thường.
   - Khi giải toán xác suất (Nhị thức B(n,p), Poisson P(λ), Phân phối chuẩn N(μ,σ²), Bayes, tổ hợp), trình bày công thức rõ ràng bằng KaTeX ($...$ / $$...$$), tính giá trị chính xác từng bước.
   - Danh sách 31+ loại biểu đồ \`\`\`recharts ... \`\`\` hỗ trợ:
     • Cơ bản, Thời gian & So sánh: \`bar\`, \`grouped_bar\`, \`stacked_bar\`, \`horizontal_bar\`, \`line\`, \`time_graph\`, \`pie\`, \`donut\`, \`area\`, \`stacked_area\`, \`combo\` (\`barSeries\`, \`lineSeries\`), \`pictogram\` (\`icon\`: \`person|star|box|heart|leaf|circle\`, \`unitValue\`, \`unit\`).
     • Thuật toán, Big O & Sơ đồ luồng: \`algorithm_trace\` (\`bfs\`, \`dfs\`, \`bfs_vs_dfs\`, \`binary_search\`, \`dijkstra\`, \`two_pointers\`), \`big_o\`, \`flowchart\`.
     • Thống kê & Phân bố: \`histogram\`, \`boxplot\`, \`violin\`, \`scatter\`, \`bubble\`, \`heatmap\`, \`radar\`, \`waterfall\`, \`funnel\`.
     • Phân cấp, Tài chính, Tiến độ, Luồng, Mạng & Bản đồ (kể cả DDoS): \`treemap\`, \`sunburst\`, \`candlestick\`, \`ohlc\`, \`gantt\`, \`sankey\`, \`network\`, \`choropleth\` (\`region:"vietnam"|"world"|"auto"\`), \`ddos_map\` (\`{"type":"ddos_map","title":"...","unit":"Gbps","attacks":[{"source":"CN","target":"VN","type":"SYN Flood","volume":120}]}\`).
     • Toán học, Tích phân, Hệ trục tọa độ Oxy / Oxyz, Parabol, Vector & Đồ thị 3D tương tác: \`integral\`, \`coordinate_2d\`, \`vector_2d\`, \`surface_3d\`, \`vector_3d\`, \`parametric_3d\`, \`scatter_3d\`.
8. GỢI Ý BƯỚC TIẾP THEO:
   Ở dòng cuối cùng của phản hồi, thêm đúng 1 dòng theo định dạng:
   [SUGGESTIONS: gợi ý 1 | gợi ý 2 | gợi ý 3]
   Mỗi gợi ý dài tối đa 8 từ, đúng ngữ cảnh việc nên làm tiếp theo và viết bằng ngôn ngữ ${language}.
9. TRÌNH PHÁT NHẠC NỀN MCP (https://test1-gamma-navy-38.vercel.app/):
   - Khi người dùng yêu cầu bật, mở, phát, nghe bài hát hoặc lặp lại (loop), dùng: [[MCP_MUSIC:{"action":"play","query":"tên bài hát"}]] (các action: "play", "pause", "resume", "next", "prev", "stop", "loop" với "mode":"one|all|off").
   - QUY TẮC TRÙNG TÊN BÀI HÁT: Nếu người dùng chỉ nói tên bài hát rất phổ biến/dễ trùng nhiều ca sĩ, ban nhạc khác nhau mà KHÔNG nêu rõ tên tác giả/ca sĩ, hãy thân thiện hỏi lại là của tác giả/ban nhạc nào (hệ thống MCP cũng sẽ hiện danh sách gợi ý để chọn).
10. HỆ SINH THÁI MCP HUB, YOUTUBE & TÌM KIẾM WEBSITE AN TOÀN (SIMULATION BOX, GOOGLE FORM, FACEBOOK):
   - Khi người dùng yêu cầu tìm website hoặc video YouTube theo nhu cầu: dùng Google Search lấy URL thật, trình bày danh sách ngắn gọn theo dạng Markdown link chuẩn \`[Tiêu đề](https://...)\` (hỗ trợ đầy đủ link YouTube \`youtube.com/watch?v=...\` / \`youtu.be/...\`). Với link sạch, KHÔNG in văn bản cảnh báo rườm rà; chỉ cảnh báo ngắn nếu tên miền thực sự có rủi ro để người dùng bấm vào mở ngay hộp mô phỏng website / phát trực tiếp.
   - Mở website/YouTube trong hộp mô phỏng website nếu cần mở ngay 1 URL duy nhất: [[MCP_WEB:{"url":"https://..."}]]
   - Tự động đọc & điền Google Form (kèm gợi ý answers theo câu hỏi nếu có): [[MCP_FORM:{"url":"https://docs.google.com/forms/...","answers":{"Họ và tên":"..."}}]]
   - Soạn/đăng bài Facebook Page hoặc tạo link chia sẻ nhanh: [[MCP_FACEBOOK:{"action":"build_share_post","message":"nội dung","link":"https://..."}]]

11. ĐỒ THỊ GIÁ TRADINGVIEW REAL-TIME, SƠ ĐỒ NẾN & DỰ BÁO BUY/SELL + TP/SL:
   - BẤT CỨ KHI NÀO người dùng hỏi về giá cổ phiếu, crypto, vàng, forex, vẽ sơ đồ nến của một mã tài sản hoặc phân tích kỹ thuật/dự báo Buy/Sell/TP/SL (FPT, VCB, NVDA, BTC, ETH, XAU, EURUSD...), LUÔN xuất khối mã:
     \`\`\`tradingview
     {"symbol":"EXCHANGE:SYMBOL","interval":"D","title":"Tên tài sản"}
     \`\`\`
     (ví dụ \`HOSE:FPT\`, \`NASDAQ:NVDA\`, \`BINANCE:BTCUSDT\`, \`OANDA:XAUUSD\`, \`FX:EURUSD\`; hỗ trợ đầy đủ khung thời gian \`"1"\` (1 phút), \`"5"\` (5 phút), \`"15"\` (15 phút), \`"60"\` (1 giờ), \`"D"\`, \`"W"\`). Hệ thống tự động hiển thị cả biểu đồ nến API trực tiếp (có zoom/pan, overlay EMA9/VWAP/Kalman/S&R/FVG) và TradingView Widget cùng tín hiệu BUY/SELL, Entry, SL, TP1, TP2.
   - Nếu người dùng yêu cầu vẽ sơ đồ nến cho dữ liệu giả định/tùy chỉnh không gắn mã sàn, xuất \`\`\`recharts {"type":"candlestick","title":"...","data":[{"date":"...","open":...,"high":...,"low":...,"close":...,"volume":...}]} \`\`\`.

[NGỮ CẢNH HỘI THOẠI]:
${summary}`;

  if (mode === AIMode.CODE) prompt += "\n\nChế độ Code: Ưu tiên kiến trúc kỹ thuật chuẩn production, giải thích ngắn gọn và code hoàn chỉnh 100%, không placeholder `// ...`, không lỗi runtime/import/cú pháp, kiểm tra kỹ ngoặc `()[]{}` và đúng loại file `.tsx`/`.ts` vs `.jsx`/`.js`. Nếu tạo dự án nhiều tệp, xuất đầy đủ mọi tệp kèm FILENAME: duong_dan/file.ext. Hệ thống hỗ trợ chạy trực tiếp các thư viện vẽ & game như Python (pygame, turtle, matplotlib), Java Swing/AWT Graphics2D (JFrame, JPanel) và C/C++ (graphics.h, raylib.h, SDL2).";
  if (mode === AIMode.APP_PREVIEW) prompt += "\n\nChế độ Chạy thử App (App Runner): Bạn là kỹ sư phát triển ứng dụng & game đa ngôn ngữ (React + TypeScript + framer-motion/lucide-react/canvas-confetti/recharts, Vue 3 .vue SFC, HTML/CSS/TypeScript, Python pygame/turtle/matplotlib, Java Swing/AWT Graphics2D đa tệp .java, C/C++ graphics.h/raylib.h/SDL2 đa tệp .cpp/.h, Browser Extension MV3, Minecraft Fabric Mod, GLSL Shader .frag, Brainfuck .bf). Khi tạo hoặc sửa dự án, luôn thiết kế giao diện tối giản sạch sẽ, tự kiểm tra import/export/ngoặc/JSX/React hooks không một lỗi cú pháp, trả về mã nguồn đầy đủ từng file (cấm dùng // ...) kèm FILENAME: duong_dan/file.ext để chạy ngay không lỗi.";
  if (mode === AIMode.DEEP) prompt += "\n\nChế độ Phân tích sâu (Deep Search): Lập luận chặt chẽ, đa chiều, đối chiếu chéo nhiều nguồn xác thực khi tìm kiếm web và trích dẫn nguồn rõ ràng, không suy đoán vô căn cứ.";
  if (mode === AIMode.RESEARCH) prompt += "\n\nChế độ Nghiên cứu (Deep Search): Tự động phân rã câu hỏi, đối chiếu đa nguồn Google Search theo thời gian thực, trình bày bảng so sánh/số liệu xác thực kèm trích dẫn nguồn rõ ràng.";
  if (mode === AIMode.TRADING) prompt += "\n\nChế độ Trading AI (6-Tier Quantitative & Multi-Model System): Bạn là hệ thống nghiên cứu giao dịch định lượng & thuật toán (Chứng khoán VN/Mỹ, Crypto, Vàng XAU, Forex). Quy tắc bắt buộc:\n1) VẼ ĐỒ THỊ GIÁ BẰNG API TRADINGVIEW CHO MỌI TÀI SẢN: Bất cứ khi nào phân tích cổ phiếu, chỉ số, crypto, vàng hay forex (FPT, VCB, VNINDEX, AAPL, NVDA, BTC, ETH, XAU, EURUSD...), LUÔN hiển thị đồ thị bằng khối ```tradingview\\n{\"symbol\":\"BINANCE:BTCUSDT\",\"interval\":\"D\",\"title\":\"Tên tài sản\"}\\n``` (hỗ trợ các khung \"1\" [1m], \"5\" [5m], \"15\", \"60\", \"D\", \"W\" tùy yêu cầu người dùng; hệ thống sẽ tự kéo nến real-time + zoom/pan + widget + TP/SL). Có thể vẽ thêm ```recharts ... ``` nếu muốn minh họa biểu đồ phụ.\n2) CHỈ DÙNG SỐ LIỆU THỰC & KHÔNG BỊA L2: Sử dụng dữ liệu thật và kết quả 6 cấp đã tính sẵn trên server (hoặc Google Search). Nếu tài sản không có L2 Order Book (như chứng khoán/forex trên feed miễn phí), ghi rõ là dữ liệu L2 không có sẵn và chỉ phân tích Volume Profile/VWAP/Delta từ OHLCV — tuyệt đối không bịa Bid/Ask imbalance.\n3) TRÌNH BÀY ĐỦ 6 CẤP THUẬT TOÁN & ENTRY/TP/SL KHI PHÂN TÍCH:\n   • Cấp 1 — Price Action nâng cao: Market Structure (HH/HL/LH/LL), BOS, CHoCH, Dynamic S/R, Liquidity Sweep, Fair Value Gap (FVG), Supply/Demand, Multi-Timeframe (MTF).\n   • Cấp 2 — Quantitative Trading: Kalman Filter (fair value & innovation Z), GARCH(1,1) & Garman-Klass Volatility, Mean Reversion Z-score & Ornstein-Uhlenbeck Half-Life, Volatility-adjusted Momentum, Stat-Arb spread Z, Hurst Exponent, Market Regime.\n   • Cấp 3 — Order Flow / Microstructure: Volume Profile (POC/VAH/VAL), VWAP ±1σ, Delta/CVD, Kyle's Lambda market impact proxy (và Bid/Ask Imbalance % / OBI / Spread / Slippage L2 khi là crypto).\n   • Cấp 4 — Deep Learning Pipeline: 7-Modality Feature Encoder (OHLCV + Order Flow + Volume + Volatility + Market Structure + Indicators + MTF) → TCN / PatchTST / Transformer heads → Regime Ensemble → P(up/down/neutral) + Expected Return + kiểm nghiệm Out-of-Sample (OOS) từng trường phái.\n   • Cấp 5 — Reinforcement Learning (PPO/SAC/DQN): Quyết định [LONG / SHORT / STAND_ASIDE / REDUCE_POSITION] tối ưu risk-adjusted Sharpe/Sortino-Drawdown thay vì lợi nhuận thô.\n   • Cấp 6 — Hệ thống Multi-Model (Model A Direction, B Volatility, C Regime, D Liquidity, E Entry Timing, F Position Sizing → Meta Model → Final Decision): Biến từng trường phái thành feature/prediction riêng để kiểm nghiệm OOS thay vì nhồi nhét tất cả indicator vào 1 model. Xuất kèm khuyến nghị BUY / SELL / STAND ASIDE, P(up/down/neutral), Expected Return, Entry, SL, TP1/TP2, R:R và % rủi ro Kelly phân đoạn.\n4) Kèm code Python định lượng/backtest đầy đủ nếu người dùng yêu cầu và lưu ý trung lập rằng phân tích chỉ mang tính tham khảo kỹ thuật, không phải lời khuyên đầu tư tài chính.";
  return prompt;
}

async function fetchWithTransientRetry(
  url: string,
  init: RequestInit,
  maxRetries = 2
): Promise<Response> {
  let lastError: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (init.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 650 * attempt));
    }
    try {
      const resp = await fetch(url, init);
      if ((resp.status === 502 || resp.status === 503 || resp.status === 504) && attempt < maxRetries) {
        await resp.text().catch(() => '');
        continue;
      }
      return resp;
    } catch (err: any) {
      if (err?.name === 'AbortError' || init.signal?.aborted) {
        throw err;
      }
      lastError = err;
      if (attempt >= maxRetries) {
        throw err;
      }
    }
  }
  throw lastError || new Error('Không thể kết nối tới máy chủ API.');
}

function parseHttpErrorMessage(status: number, statusText: string, errText: string): string {
  let parsedErr = errText.trim();
  try {
    const json = JSON.parse(errText);
    parsedErr = json.error || json.message || parsedErr;
  } catch {
    if (parsedErr.startsWith('<')) {
      parsedErr = '';
    }
  }
  if (!parsedErr && (status === 503 || status === 502 || status === 504)) {
    return `Máy chủ AI đang quá tải tạm thời (${status}). Vui lòng thử gửi lại sau vài giây.`;
  }
  return parsedErr || `HTTP ${status} (${statusText || 'API Server Error'})`;
}

export class MasterNeuralNetworkBridge {
  async *generateStream(contents: any[], config: any, mode: AIMode, signal?: AbortSignal, model: string = 'gemini-3-flash-preview', language: string = 'Vietnamese') {
    let response: Response;
    try {
      response = await fetchWithTransientRetry('/api/v2/kernel/neural-matrix-compute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, config, mode, model, language }),
        signal
      });
    } catch (networkErr: any) {
      if (networkErr?.name === 'AbortError') throw networkErr;
      throw new Error(networkErr?.message || 'Không thể kết nối tới máy chủ API (/api/v2/kernel/neural-matrix-compute).');
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(parseHttpErrorMessage(response.status, response.statusText, errText));
    }

    const parseSseLine = (rawLine: string): { done?: boolean; error?: string; text?: string; thought?: string; sources?: any[] } | null => {
      const trimmed = rawLine.trim();
      if (!trimmed.startsWith("data:")) return null;
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr) return null;
      if (jsonStr === "[DONE]") return { done: true };
      try {
        const data = JSON.parse(jsonStr);
        if (data?.error) {
          return { error: String(data.error) };
        }
        return {
          text: data.text || '',
          thought: data.thought || '',
          sources: data.sources || []
        };
      } catch (e) {
        console.error("Lỗi parse dữ liệu luồng:", trimmed, e);
        return null;
      }
    };

    const reader = response.body?.getReader?.();
    if (!reader) {
      const rawFallback = await response.text();
      let gotFallback = false;
      for (const line of rawFallback.split(/\r?\n/)) {
        const parsed = parseSseLine(line);
        if (!parsed) continue;
        if (parsed.done) break;
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.text || parsed.thought || (parsed.sources && parsed.sources.length > 0)) {
          gotFallback = true;
          yield {
            text: parsed.text || '',
            thought: parsed.thought || '',
            sources: parsed.sources || []
          };
        }
      }
      if (!gotFallback) {
        throw new Error("Không nhận được dữ liệu phản hồi từ máy chủ.");
      }
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let receivedOutput = false;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          const parsed = parseSseLine(line);
          if (!parsed) continue;
          if (parsed.done) {
            if (!receivedOutput) {
              throw new Error("Máy chủ đã đóng luồng nhưng không trả về nội dung phản hồi.");
            }
            return;
          }
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.text || parsed.thought || (parsed.sources && parsed.sources.length > 0)) {
            receivedOutput = true;
          }
          yield {
            text: parsed.text || '',
            thought: parsed.thought || '',
            sources: parsed.sources || []
          };
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        const trailingLines = buffer.split(/\r?\n/);
        for (const line of trailingLines) {
          const parsed = parseSseLine(line);
          if (!parsed) continue;
          if (parsed.done) {
            if (!receivedOutput) {
              throw new Error("Máy chủ đã đóng luồng nhưng không trả về nội dung phản hồi.");
            }
            return;
          }
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.text || parsed.thought || (parsed.sources && parsed.sources.length > 0)) {
            receivedOutput = true;
          }
          yield {
            text: parsed.text || '',
            thought: parsed.thought || '',
            sources: parsed.sources || []
          };
        }
      }

      if (!receivedOutput) {
        throw new Error("Luồng phản hồi kết thúc mà không có dữ liệu từ API.");
      }
    } finally {
      reader.releaseLock();
    }
  }

  async generateResponse(contents: any[], config: any, mode: AIMode, model: string = 'gemini-3-flash-preview') {
    let response: Response;
    try {
      response = await fetchWithTransientRetry('/api/v2/kernel/cognitive-tensor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, config, mode, model })
      });
    } catch (networkErr: any) {
      throw new Error(networkErr?.message || 'Không thể kết nối tới máy chủ API (/api/v2/kernel/cognitive-tensor).');
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(parseHttpErrorMessage(response.status, response.statusText, errText));
    }

    return await response.json();
  }
}


import { TheMasterCore } from "@/lib/shadowBrain";
import { MasterNeuralNetworkBridge, classifyImplicitVisualIntent, detectDetectiveIntent, getSystemPrompt } from "@/lib/neuralBridge";
import { AIMode, Language, Message, Attachment, GroundingSource, WorkspaceFile } from "@/types";
import { buildAsciiTreeFromPaths } from "@/lib/fileGenerator";
import { runWorkspaceBuildCheck } from "@/lib/workspaceBuilder";
import { inferMediaMimeType, isAudioMedia, isNativeMultimodalMedia, isVideoMedia } from "@/lib/mediaUtils";

export const brain = new TheMasterCore();
const client = new MasterNeuralNetworkBridge();

export function clearChatMemory() {
  brain.clear();
}

export function getMemoryData() {
  return {
    nodes: brain.getMemoryNodes(),
    stats: brain.getContext().memoryStats
  };
}

export function deleteMemoryNode(id: string) {
  brain.deleteNode(id);
}

export function tagMemoryNode(id: string, tag: string) {
  brain.tagNode(id, tag);
}

function summarizeFileExports(file: WorkspaceFile): string {
  if (file.isBinary || typeof file.content !== 'string') return '';
  if (!/\.(tsx?|jsx?|mjs|cjs)$/i.test(file.path)) return '';
  const c = file.content;
  const exps: string[] = [];
  if (/\bexport\s+default\b/.test(c)) exps.push('default');
  for (const m of c.matchAll(/\bexport\s+(?:async\s+)?(?:function\*?\s+|const\s+|let\s+|class\s+|interface\s+|type\s+)([A-Za-z_$][A-Za-z0-9_$]*)/g)) {
    if (!exps.includes(m[1])) exps.push(m[1]);
    if (exps.length >= 8) break;
  }
  return exps.length > 0 ? `exports: [${exps.join(', ')}]` : '';
}

export async function* sendMessageStream(
  message: string,
  history: Message[],
  mode: AIMode,
  language: Language,
  attachments: Attachment[] = [],
  signal?: AbortSignal,
  isEcoMode: boolean = false,
  model: string = 'gemini-3-flash-preview',
  _isApiOnline: boolean = true,
  username?: string,
  workspaceFiles: WorkspaceFile[] = [],
  workspaceName: string = 'project',
  enableWebSearch: boolean = false
) {
  brain.addMessage("user", message);

  const context = brain.getContext();
  let enhancedContext = context.summary;

  // Identify if User is Owner TMkingreal / king
  if (username) {
    const norm = username.toLowerCase();
    if (norm.includes("kingreal") || norm.includes("tm_") || norm === "king") {
      enhancedContext += `\n\n[XÁC THỰC CHỦ SỞ HỮU]: Người dùng đang trò chuyện là TMkingreal (king), người sáng tạo ra TheMaster.`;
    }
  }

  const currentIQ = brain.getCognitiveLevel();

  // Collect any previously uploaded images in history so AI can embed them in docx/pptx across turns
  const historyImages: { id: string; name: string }[] = [];
  for (const h of history) {
    if (h.attachments) {
      for (const att of h.attachments) {
        if (att.type === 'image' && att.data) {
          historyImages.push({ id: att.id, name: att.name });
        }
      }
    }
  }
  if (historyImages.length > 0) {
    enhancedContext += `\n[ẢNH ĐÃ ĐÍNH KÈM TRONG HỘI THOẠI (dùng để chèn vào DOCX/PPTX nếu cần)]:\n` +
      historyImages.map((img, i) => `- Ảnh #${i + 1}: "${img.name}" -> IMAGE_ID: attach://${img.id}`).join('\n');
  }

  if (workspaceFiles && workspaceFiles.length > 0) {
    const projectTree = buildAsciiTreeFromPaths(workspaceFiles.map(f => f.path), workspaceName || 'project');
    const assetItems = workspaceFiles.filter(f => f.dataUrl || f.mimeType?.startsWith('image/'));
    const textFiles = workspaceFiles.filter(f => !f.isBinary && typeof f.content === 'string');
    const diag = runWorkspaceBuildCheck(workspaceFiles, workspaceName || 'project');

    const pkgFile = textFiles.find(f => f.path.toLowerCase() === 'package.json');
    let pkgDepsNote = '';
    if (pkgFile?.content) {
      try {
        const pkg = JSON.parse(pkgFile.content);
        const deps = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) });
        if (deps.length > 0) pkgDepsNote = `\n- Dependencies trong package.json: ${deps.join(', ')}`;
      } catch {}
    }

    enhancedContext += `\n\n[THƯ MỤC DỰ ÁN WORKSPACE HIỆN TẠI: ${workspaceName || 'project'} (${workspaceFiles.length} tệp | Stack: ${diag.framework})]:\n${projectTree}${pkgDepsNote}`;

    if (diag.errors.length > 0 || diag.warnings.length > 0) {
      enhancedContext += `\n\n[CHẨN ĐOÁN LỖI & CẢNH BÁO HIỆN TẠI TRONG FOLDER]:`;
      if (diag.errors.length > 0) {
        enhancedContext += `\n- Lỗi (${diag.errors.length}):\n  • ${diag.errors.join('\n  • ')}`;
      }
      if (diag.warnings.length > 0) {
        enhancedContext += `\n- Cảnh báo (${diag.warnings.length}):\n  • ${diag.warnings.slice(0, 12).join('\n  • ')}`;
      }
    }

    const exportSummaryLines = textFiles
      .map((tf) => {
        const sym = summarizeFileExports(tf);
        return sym ? `- ${tf.path}: ${sym}` : '';
      })
      .filter(Boolean);
    if (exportSummaryLines.length > 0) {
      enhancedContext += `\n\n[MỤC LỤC EXPORTS CỦA CÁC MODULE]:\n${exportSummaryLines.join('\n')}`;
    }

    if (assetItems.length > 0) {
      enhancedContext += `\n\n[ẢNH TRONG THƯ MỤC ASSET (dùng đường dẫn này trong code HTML/React hoặc DOCX/PPTX)]:\n` +
        assetItems.map(a => `- ${a.path}`).join('\n');
    }

    let charBudget = 90000;
    const priorityScore = (p: string) => {
      const l = p.toLowerCase();
      if (
        l === 'manifest.json' ||
        l.endsWith('/manifest.json') ||
        l === 'package.json' ||
        l === 'index.html' ||
        l === 'build.gradle' ||
        l === 'build.gradle.kts' ||
        l === 'gradle.properties' ||
        l.endsWith('/fabric.mod.json')
      ) return 0;
      if (
        /^(src\/)?(main|app|popup|content|background|options|sidepanel)\.(tsx|jsx|ts|js|vue|html|py)$/i.test(l) ||
        /screen\.(java|kt)$/i.test(l) ||
        /lang\/.*\.json$/i.test(l) ||
        /\.(frag|glsl|bf)$/i.test(l)
      ) return 1;
      return 2;
    };
    const sortedCode = [...textFiles].sort((a, b) => priorityScore(a.path) - priorityScore(b.path));
    enhancedContext += `\n\n[NỘI DUNG MÃ NGUỒN TRONG THƯ MỤC DỰ ÁN]:\n`;
    const omittedFiles: string[] = [];
    for (const file of sortedCode) {
      const rawContent = file.content || '';
      const wasTruncated = rawContent.length > 24000;
      const snippet = rawContent.slice(0, 24000);
      if (charBudget - snippet.length < 0 && enhancedContext.length > 95000) {
        omittedFiles.push(file.path);
        continue;
      }
      charBudget -= snippet.length;
      enhancedContext += `\n--- FILE: ${file.path}${wasTruncated ? ' [ĐÃ CẮT NGẮN]' : ''} ---\n\`\`\`\n${snippet}\n\`\`\`\n`;
    }
    if (omittedFiles.length > 0) {
      enhancedContext += `\n[CÁC TỆP CHƯA ĐỌC HẾT DO GIỚI HẠN NGỮ CẢNH]: ${omittedFiles.join(', ')}`;
    }
    enhancedContext += `\n(QUY TẮC BẮT BUỘC KHI CODE & FIX LỖI TRONG FOLDER:
1. Đọc kỹ toàn bộ cây thư mục, mục lục exports và chẩn đoán lỗi ở trên trước khi viết. Tìm đúng NGUYÊN NHÂN GỐC RỄ (đặc biệt sai default/named import, gọi sai hàm \`... is not a function\`, thiếu guard mảng/object null, sai props).
2. TUYỆT ĐỐI KHÔNG chỉ giải thích bằng lời khi người dùng yêu cầu sửa/thêm code — BẮT BUỘC xuất từng tệp cần sửa kèm \`FILENAME: duong_dan/file.ext\` để ghi trực tiếp vào folder. Kiểm tra đồng bộ mọi tệp gọi/import nhau.
3. Mỗi khối code phải ĐẦY ĐỦ 100% — CẤM \`// ...\`, CẤM TS trong \`.js/.jsx\`, CẤM quên \`import { useState, ... } from 'react'\`, CẤM tạo import tới file không tồn tại.
4. Hệ thống sẽ ghi vào folder và TỰ CHẠY THỬ CODE TRONG SANDBOX kiểm tra lỗi build & runtime trước khi giao cho người dùng.)`;
  } else {
    const visualIntent = classifyImplicitVisualIntent(message);
    if (visualIntent.reason === 'explicit_or_implicit_3d_4d') {
      enhancedContext += `\n\n[GỢI Ý MÔ HÌNH 3D/4D/5D NGỮ CẢNH]: Yêu cầu này là vẽ mô hình 3D, kiến trúc, vật thể, đa diện 4D/5D hoặc dựng mô hình thiết kế từ ảnh. Hãy xuất khối \`\`\`model3d ... \`\`\` (KHÔNG vẽ trên hệ trục tọa độ Oxyz). Hỗ trợ shape_5d ("penteract", "5orthoplex", "5simplex", "demipenteract", "5torus"). Nếu có ảnh đính kèm, có thể dùng \`"category":"image_3d","image":"attach://..."\` hoặc lắp ghép \`"category":"design_3d"\` với mảng \`parts\` sát thiết kế trong ảnh.`;
    } else if (visualIntent.reason === 'explicit_or_implicit_math_data') {
      enhancedContext += `\n\n[GỢI Ý TRỰC QUAN NGỮ CẢNH]: Câu hỏi này có yếu tố hàm số/toán tọa độ/so sánh số liệu, lộ trình hoặc xu hướng. Hãy chủ động vẽ kèm biểu đồ \`\`\`recharts ... \`\`\` (hoặc \`\`\`tradingview ... \`\`\` nếu là giá tài sản) phù hợp dù người dùng không nhắc từ "vẽ". LƯU Ý: Nếu chỉ vẽ biểu đồ dữ liệu/lộ trình thông thường, KHÔNG xuất đồ thị hàm số/tọa độ.`;
    } else if (visualIntent.reason === 'explicit_or_implicit_sheet') {
      enhancedContext += `\n\n[GỢI Ý BẢNG TÍNH NGỮ CẢNH]: Yêu cầu này cần bảng tính có công thức cộng/nhân/trung bình nhiều dòng. Hãy chủ động xuất khối \`\`\`spreadsheet ... \`\`\` chuẩn JSON với công thức (=SUM, =AVERAGE, =IF...) dù người dùng không gõ từ "bảng tính".`;
    } else if (visualIntent.suppressVisuals) {
      enhancedContext += `\n\n[GỢI Ý NGỮ CẢNH]: Đây là câu hỏi chữ / hỏi đáp ngắn / lập trình — KHÔNG tự ý vẽ biểu đồ hay bảng tính thừa nếu không thực sự cần thiết.`;
    }
  }

  if (detectDetectiveIntent(message)) {
    enhancedContext += `\n\n[CHẾ ĐỘ TRINH THÁM & PHÁ ÁN CHUYÊN SÂU — CHỈ KÍCH HOẠT DO NGƯỜI DÙNG YÊU CẦU]:
Hãy vận dụng tư duy trinh thám phân tích sắc bén ở mức cao nhất:
1. **Khôi phục Dòng thời gian & Ràng buộc Vật lý/Số (Timeline & Physical Constraints)**: Đối chiếu từng mốc giờ, khoảng cách di chuyển, hiện trường, metadata, dấu vết vật lý hoặc kỹ thuật số để kiểm tra tính khả thi thực tế.
2. **Ma trận Mâu thuẫn & Kiểm tra Ngoại phạm (Alibi & Slip Detection)**: Chỉ ra mọi chi tiết tự mâu thuẫn trong lời khai, chi tiết "chỉ kẻ gây án mới biết", động cơ–phương tiện–cơ hội (Motive–Means–Opportunity), và nhận diện bẫy đánh lạc hướng (red herrings).
3. **Phân tách Bắt buộc**: Tách bạch rõ **[XÁC THỰC]** (sự kiện hiển nhiên trong đề bài) với **[SUY LUẬN]** (kết luận rút ra từ logic) — tuyệt đối không bịa thêm bằng chứng ngoài dữ kiện, nếu thiếu dữ kiện hãy chỉ rõ giả thuyết nào chưa thể chốt.
4. **Loại trừ Bayes & Kết luận**: Loại trừ lần lượt từng nghi phạm/giả thuyết bất khả thi, chấm độ tin cậy giả thuyết khả dĩ nhất và nêu ngắn gọn câu hỏi/manh mối cần kiểm chứng tiếp theo nếu vụ án còn điểm mở.`;
  }

  const systemInstruction = getSystemPrompt(mode, language, context.profile, enhancedContext, isEcoMode, currentIQ);

  const userParts: any[] = [{ text: message }];
  let hasAudioAttachment = false;
  let hasVideoAttachment = false;

  attachments.forEach(att => {
    const normalizedMime = inferMediaMimeType(att.name, att.mimeType);
    const isAudio = isAudioMedia(normalizedMime, att.name);
    const isVideo = isVideoMedia(normalizedMime, att.name);
    const isNativeMultimodal = Boolean(att.data) && isNativeMultimodalMedia(normalizedMime, att.name);

    if (isAudio) hasAudioAttachment = true;
    if (isVideo) hasVideoAttachment = true;

    if (isNativeMultimodal) {
      userParts.push({ inlineData: { mimeType: normalizedMime, data: att.data } });

      if (att.textContent) {
        userParts[0].text += `\n\n[Tệp Tài Liệu: ${att.name}]\n${att.textContent}`;
      } else if (att.type === 'image' || normalizedMime.startsWith('image/')) {
        userParts[0].text += `\n\n[Đã đính kèm ảnh: "${att.name}" | IMAGE_ID để chèn vào DOCX/PPTX: attach://${att.id}]`;
      } else if (isVideo) {
        userParts[0].text += `\n\n[Đã đính kèm tệp Video (${normalizedMime}): ${att.name}]`;
      } else if (isAudio) {
        userParts[0].text += `\n\n[Đã đính kèm tệp Âm thanh (${normalizedMime}): ${att.name}]`;
      } else {
        userParts[0].text += `\n\n[Đã đính kèm tệp phương tiện đa phương thức (${normalizedMime}): ${att.name}]`;
      }
    } else {
      // For source code, text files and other document configurations
      userParts[0].text += `\n\n--- DỮ LIỆU TỆP ĐÍNH KÈM SẴN CÓ ---`;
      userParts[0].text += `\n- Tên tệp: ${att.name}`;
      userParts[0].text += `\n- Loại nội dung: ${normalizedMime || 'unknown'}`;
      userParts[0].text += `\n- Kích thước: ${(att.size / 1024).toFixed(1)} KB`;
      if (att.textContent) {
        userParts[0].text += `\n- Nội dung tệp thực tế:\n\`\`\`\n${att.textContent}\n\`\`\``;
      }
      userParts[0].text += `\n---------------------------------------`;
    }
  });

  if (hasAudioAttachment || hasVideoAttachment) {
    userParts[0].text += `\n\n[YÊU CẦU PHÂN TÍCH MEDIA CHUẨN XÁC]: Hãy nghe/xem thật kỹ dữ liệu ${hasVideoAttachment ? 'video (cả hình ảnh từng khung cảnh, chữ trên màn hình OCR, âm thanh)' : 'âm thanh'} đính kèm. Trình bày có mốc thời gian [MM:SS - MM:SS], phiên âm nguyên văn chuẩn xác các đoạn lời thoại/âm thanh quan trọng, nêu chi tiết bối cảnh/nhịp điệu/chuyển cảnh/đối tượng. Chỉ báo cáo những gì thực sự nghe và thấy trong tệp, tuyệt đối không bịa thêm hoặc đoán mò chi tiết không có trong tệp.`;
  }

  // Context Pruning (exclude the just-added trailing user message to avoid duplication)
  const historyLimit = isEcoMode ? -4 : -20;
  const priorHistory = context.recent.slice(historyLimit, -1);

  const contents: any[] = [];
  for (const msg of priorHistory) {
    const role = msg.role === 'user' ? 'user' : 'model';
    const text = (msg.content || '').trim();
    if (!text) continue;
    const prev = contents[contents.length - 1];
    if (prev && prev.role === role) {
      prev.parts[0].text += `\n\n${text}`;
    } else {
      contents.push({ role, parts: [{ text }] });
    }
  }

  const prevLast = contents[contents.length - 1];
  if (prevLast && prevLast.role === 'user' && attachments.length === 0) {
    prevLast.parts[0].text += `\n\n${userParts[0].text}`;
  } else {
    contents.push({
      role: 'user',
      parts: userParts
    });
  }

  let fullAssistantResponse = "";
  const logs: any[] = [];
  try {
    const config: any = { 
      systemInstruction,
      enableSearch: Boolean(enableWebSearch),
      enableDeepSearch: Boolean(enableWebSearch && (mode === AIMode.DEEP || mode === AIMode.RESEARCH)),
    };
    
    const stream = client.generateStream(contents, config, mode, signal, model, language);

    for await (const chunk of stream) {
      if (signal?.aborted) break;
      
      const { text, thought, sources } = chunk;
      fullAssistantResponse += text;

      yield { 
        text, 
        thought, 
        sources,
        terminalLogs: [] 
      };
    }

    logs.length = 0;
    logs.push({ message: `[SOURCE: CLOUD_API] Data stream via TheMaster.`, type: 'info' });

    if (fullAssistantResponse.trim()) {
      brain.addMessage("assistant", fullAssistantResponse);
    }

    yield { 
      text: "", 
      isLearned: false,
      isUsedLocal: false,
      terminalLogs: logs
    };

  } catch (error: any) {
    if (error?.name === 'AbortError' || signal?.aborted) {
      throw error;
    }

    const errMsg = String(error?.message || '');
    const isQuota = error?.message?.includes('quota') || error?.status === 'RESOURCE_EXHAUSTED' || error?.code === 429 || errMsg.includes('429');
    const is503 = error?.code === 503 || error?.status === 'UNAVAILABLE' || /503|high demand|quá tải tạm thời|unavailable/i.test(errMsg);

    if (isQuota) {
      yield {
        text: '\n\n⚠️ **Hệ thống đã vượt quá giới hạn lưu lượng (429 Quota Exceeded).** Vui lòng đợi một lát hoặc thử lại sau.',
        terminalLogs: [{ message: '[API_ERROR] 429 Quota Exceeded', type: 'error' }]
      };
      return;
    }

    if (is503) {
      yield {
        text: '\n\n⚠️ **Máy chủ AI đang quá tải tạm thời (503 Service Unavailable).** Vui lòng thử lại sau giây lát.',
        terminalLogs: [{ message: '[API_ERROR] 503 Service Unavailable', type: 'error' }]
      };
      return;
    }

    throw error;
  }
}

/**
 * Sends a message stream to the AI and processes memory updates.
 * 
 * @example
 * // Basic Chat
 * for await (const chunk of sendMessageStream("Hello", [], AIMode.CHAT, Language.VIETNAMESE)) {
 *   console.log(chunk.text);
 * }
 * 
 * @example
 * // Research mode with English output
 * for await (const chunk of sendMessageStream("Analyze this", [], AIMode.RESEARCH, Language.ENGLISH)) {
 *   if (chunk.sources) console.log(chunk.sources);
 * }
 * 
 * @example 
 * // Programming aid
 * for await (const chunk of sendMessageStream("Write a python script", [], AIMode.CODE, Language.ENGLISH)) {
 *   // Response will contain syntax-highlighted code blocks
 * }
 */
export async function translateMessage(content: string, targetLanguage: Language): Promise<string> {
  const systemInstruction = [
    "TheMaster Deep Translation Core — specialist in standard languages, regional dialects, slang, Sino-Vietnamese (Hán-Việt / Chữ Hán / Chữ Nôm), classical/ancient languages (Classical Chinese, Latin, Ancient Greek, Sanskrit, Pali, Old Norse, Old English), and rare/minority languages.",
    "Preserve formatting, code blocks, and nuance. When translating dialects, Sino-Vietnamese, or ancient/rare scripts, provide accurate natural translation plus brief gloss/phonetics or Hán-Việt reading when helpful."
  ].join(' ');
  const contents = [{
    role: 'user',
    parts: [{
      text: `Translate the following content accurately to ${targetLanguage}. Recognize regional idioms/dialects, Hán-Việt / Chữ Nôm nuances, or classical/ancient terms faithfully while maintaining technical formatting:\n\n${content}`
    }]
  }];

  try {
    const response = await client.generateResponse(contents, { systemInstruction }, AIMode.FAST);
    return response.text || content;
  } catch {
    return content;
  }
}

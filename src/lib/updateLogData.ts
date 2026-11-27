export type UpdateCategoryId = 'all' | 'charts' | 'trading' | 'models3d' | 'media';

export const CURRENT_RELEASE_VERSION = 'TheMaster ver 2.8';
export const CURRENT_RELEASE_NAME = 'Knowledge Update';

export interface UpdateLogItem {
  id: string;
  date: string;
  version?: string;
  category: Exclude<UpdateCategoryId, 'all'>;
  title: string;
  summary: string;
  details: string[];
}

export const UPDATE_CATEGORIES: Array<{ id: UpdateCategoryId; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'charts', label: 'Đồ thị & Thuật toán' },
  { id: 'trading', label: 'Trading & Định lượng' },
  { id: 'models3d', label: '3D / 4D / 5D' },
  { id: 'media', label: 'Đa phương tiện' },
];

export const UPDATE_LOG_ENTRIES: UpdateLogItem[] = [
  {
    id: '2026-11-27-ver28-knowledge-update-tcn-client',
    date: '2026-11-27',
    version: 'TheMaster ver 2.8 · Knowledge Update',
    category: 'trading',
    title: 'Knowledge Update: Tối ưu TCN Deep Learning & Hỗ trợ AI Chat mượt mà trên máy yếu, iOS & Điện thoại',
    summary:
      'Nâng cấp Deep Learning engine chạy trực tiếp trên client đồng thời tối ưu toàn diện hiệu năng trò chuyện AI trên các thiết bị cấu hình thấp, iPhone/iOS và điện thoại di động.',
    details: [
      'Hỗ trợ máy yếu, iOS & Điện thoại: Tối ưu hóa bộ nhớ, giảm độ trễ render, tinh chỉnh giao diện responsive và quản lý tệp/SSE stream gọn nhẹ giúp chat AI mượt mà tuyệt đối trên mọi thiết bị.',
      'Kiến trúc TCN tối ưu: 3 khối tích chập nhân quả giãn nở (dilation 1, 2, 4) kết hợp Depthwise-Separable Conv, LayerNorm, SiLU, Residual Skip và Multi-Scale Pooling dự báo khung 1–5 nến.',
      'Chạy trực tiếp trên Client (Browser): tải trọng số từ endpoint /api/trading/tcn-weights, lưu bộ nhớ đệm localStorage và dự phòng embedded khi ngoại tuyến với tốc độ suy luận < 2 ms.',
      'Hiển thị ngay trên Trading Chart: xác suất P(↑/↓/—), Δ% kỳ vọng ngắn hạn, chuẩn kích hoạt tầng d1/d2/d4 và tỷ lệ chính xác Out-of-Sample cuốn chiếu (Rolling OOS Hit Rate).',
    ],
  },
  {
    id: '2026-11-27-big-o-flowchart-quant',
    date: '2026-11-27',
    version: 'TheMaster ver 2.8 · Knowledge Update',
    category: 'charts',
    title: 'Đồ thị Big O, Sơ đồ luồng tương tác & Chế độ toàn màn hình tách biệt',
    summary:
      'Bổ sung trực quan hóa độ phức tạp thời gian Big O (tuyến tính/log10), sơ đồ luồng Flowchart bấm từng khối để xem giải thích, ẩn thanh điều hướng khi xem toàn màn hình và nút Update Log.',
    details: [
      'Đồ thị Big O: so sánh trực tiếp O(1), O(log n), O(√n), O(n), O(n log n), O(n²), O(n³), O(2ⁿ) với thanh kéo giá trị n và bảng ước lượng số phép tính.',
      'Sơ đồ luồng (Flowchart): hỗ trợ nút Bắt đầu/Kết thúc, Hình thoi rẽ nhánh (Decision), Xử lý và I/O; hỗ trợ bấm chọn từng khối để đọc giải thích chi tiết và chạy từng bước.',
      'Toàn màn hình (Fullscreen Portal): tự động ẩn thanh menu chính khi phóng to Đồ thị, 3D/4D/5D hoặc Trading để giữ nguyên các nút thao tác của khung phóng to.',
      'Nút Update Log ngay trên thanh menu chính để tra cứu lịch sử các bản cập nhật.',
    ],
  },
  {
    id: '2026-11-27-trading-interactive-4pillar',
    date: '2026-11-27',
    version: 'TheMaster ver 2.8 · Knowledge Update',
    category: 'trading',
    title: 'Biểu đồ Trading tương tác Zoom/Pan (1m, 5m) & Hệ thống 4 trụ cột Định lượng / DL',
    summary:
      'Mở rộng khung thời gian siêu ngắn 1m, 5m, sửa lỗi định dạng phút UTC, thêm thu phóng/kéo ngang và nâng cấp 4 trụ cột phân tích định lượng + Deep Learning đa đầu vào.',
    details: [
      'Khung thời gian mới: hỗ trợ 1m, 5m, 15m, 1H, 4H, 1D, 1W cùng độ dài lịch sử 240 nến và tương tác cuộn chuột phóng to / giữ chuột kéo trượt ngang.',
      'Lớp phủ phân tích trên biểu đồ nến: bật/tắt nhanh EMA(9), Kalman/VWAP và vùng Hỗ trợ/Kháng cự động & Fair Value Gap (FVG).',
      'Price Action & Định lượng: tính thêm Hurst Exponent, chu kỳ bán rã Mean Reversion (OU Half-Life), biến động Garman-Klass và chỉ số tác động thanh khoản Kyle Lambda.',
      'Pipeline Deep Learning đa phương thức: Feature Encoder 7 nhánh (OHLCV, Order Flow, Volume, Volatility, Market Structure, Indicators, MTF) đưa qua TCN / PatchTST / Transformer → Regime Detection → Ensemble P(up/down/neutral).',
    ],
  },
  {
    id: '2026-11-25-mp3-mp4-kinematics-algo',
    date: '2026-11-25',
    category: 'media',
    title: 'Phân tích âm thanh MP3 / video MP4 & Động học thời gian đa biến + BFS/DFS/Binary Search',
    summary:
      'Hỗ trợ tải và phân tích trực tiếp tệp MP3/MP4 với trình phát nội tuyến, đồng thời nâng cấp đồ thị chuyển động và trình chạy từng bước thuật toán.',
    details: [
      'Đa phương tiện: chuẩn hóa MIME âm thanh/video, tải tệp lớn qua Gemini Files API trên server và hiển thị trình phát audio/video ngay trong tin nhắn.',
      'Đồ thị thời gian (Time Graph): tính chính xác quãng đường s(t) = ∫v(t)dt, 2 trục Y độc lập và tự động đánh dấu điểm gặp nhau.',
      'Minh họa thuật toán (Algorithm Trace): mô phỏng từng bước BFS, DFS, so sánh BFS vs DFS, Binary Search, Dijkstra và Two Pointers kèm trạng thái Queue/Stack.',
    ],
  },
  {
    id: '2026-11-23-math2d-integral-detector',
    date: '2026-11-23',
    category: 'charts',
    title: 'Hệ trục Oxy chuẩn tỷ lệ 1:1, Tổng Riemann & Nâng cấp suy luận Trinh thám',
    summary:
      'Thêm tỷ lệ trục 1:1 cho hệ tọa độ Oxy, tô vùng tích phân Riemann, chọn dạng biểu đồ hiển thị động, sắp xếp QuickSort/MergeSort/HeapSort và chế độ trinh thám.',
    details: [
      'Toán học 2D & Tích phân: chuyển đổi mượt giữa tỷ lệ 1:1 và Auto Fit, tìm giao điểm giữa các hàm và điều chỉnh số lát cắt Riemann.',
      'Chọn dạng biểu đồ & Sắp xếp: đổi nhanh giữa Cột / Đường / Miền / Nến / OHLC và chạy QuickSort, MergeSort, HeapSort trên dữ liệu bảng.',
      'Nâng cấp phân tích suy luận trinh thám có cấu trúc khi người dùng yêu cầu điều tra manh mối hoặc chứng cứ.',
    ],
  },
  {
    id: '2026-11-21-3d-lighting-cannon-physics',
    date: '2026-11-21',
    category: 'models3d',
    title: 'Điều khiển ánh sáng 3D, Vật lý Cannon.js & Biểu đồ nến tài chính thực tế',
    summary:
      'Bổ sung Point/Directional Light + Ambient Occlusion cho khung Three.js, mô phỏng va chạm vật rắn Cannon.js và nối dữ liệu nến TradingView/Sàn giao dịch.',
    details: [
      'Ánh sáng 3D & Vật liệu: thanh trượt chỉnh cường độ Point Light, Directional Light, AO, Metalness, Roughness, Emission và Transparency.',
      'Physics Inspector: khung giới hạn va chạm, vector vận tốc và mô phỏng trọng lực / va chạm vật rắn thời gian thực qua Cannon.js.',
      'Dữ liệu thị trường thực tế: lấy giá & nến OHLCV trực tiếp từ TradingView Scanner, Binance/OKX và Yahoo Finance/TCBS/Stooq.',
    ],
  },
  {
    id: '2026-11-20-4d-5d-image3d-wireframe',
    date: '2026-11-20',
    category: 'models3d',
    title: 'Không gian 3D / 4D / 5D độc lập, Wireframe Toggle & Trích xuất hình học từ ảnh',
    summary:
      'Tách riêng không gian hiển thị mô hình 3D/4D/5D khỏi trục toán học, thêm công tắc Wireframe, đa diện 5 chiều và dựng lưới 3D từ ảnh tải lên.',
    details: [
      'Hình học cao chiều: chiếu phối cảnh 4D (Tesseract, 16-cell, Clifford Torus) và 5D (Penteract, 5-Orthoplex, 5-Simplex) với thanh chỉnh góc xoay.',
      'Ảnh → 3D: trích xuất bản đồ độ sâu (heightmap relief) thành lưới 3D solid hoặc wireframe hỗ trợ xoay và thu phóng toàn màn hình.',
      'Tối giản giao diện: loại bỏ các nút thừa, gọn bảng điều khiển và giữ quy trình quét liên kết YouTube sạch sẽ.',
    ],
  },
];

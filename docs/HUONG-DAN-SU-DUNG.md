# Hướng dẫn sử dụng web tuyển thành viên CLB BIT

Địa chỉ: **https://bit-bav.vercel.app**

## Mục lục
1. [Ai được làm gì](#1-ai-được-làm-gì)
2. [Đăng nhập](#2-đăng-nhập)
3. [Trang cá nhân `/me` (mọi thành viên)](#3-trang-cá-nhân-me-mọi-thành-viên)
4. [Ứng viên: nộp đơn](#4-ứng-viên-nộp-đơn)
5. [Trang quản trị: tổng quan](#5-trang-quản-trị-tổng-quan)
6. [Tuyển thành viên](#6-tuyển-thành-viên-quyền-tuyển-thành-viên)
7. [Thành viên, tài khoản, ban](#7-thành-viên-tài-khoản-ban-quyền-quản-lý-thành-viên)
8. [Nhiệm kỳ và chuyển giao](#8-nhiệm-kỳ-và-chuyển-giao-chỉ-chủ-nhiệm)
9. [Giao việc và nhắc hạn](#9-giao-việc-và-nhắc-hạn)
10. [Đóng góp của thành viên](#10-đóng-góp-của-thành-viên)
11. [Đối chiếu tương tác Facebook](#11-đối-chiếu-tương-tác-facebook-quyền-đối-chiếu-facebook)
12. [Khung avatar sự kiện](#12-khung-avatar-sự-kiện-quyền-đối-chiếu-facebook)
13. [Sự kiện](#13-sự-kiện-quyền-quản-lý-sự-kiện)
14. [Gửi mail hàng loạt](#14-gửi-mail-hàng-loạt-quyền-gửi-mail)
15. [Câu hỏi thường gặp](#15-câu-hỏi-thường-gặp)

---

## 1. Ai được làm gì

| Vai trò | Gồm ai | Được làm gì |
|---|---|---|
| **Chủ nhiệm** | 1 người trong Ban chủ nhiệm | Mọi việc. Là người **duy nhất** được kích hoạt nhiệm kỳ mới, đổi vai trò và cấp/gỡ quyền cho người khác. |
| **Ban chủ nhiệm** | Chủ nhiệm + các Phó chủ nhiệm | Mọi chức năng vận hành, giao việc cho mọi ban. Phó chủ nhiệm không đổi được nhiệm kỳ và quyền. |
| **Ban chủ chốt** | Trưởng ban, phó ban | Chỉ những **quyền được tick** cho từng người (xem bảng dưới). Giao việc và xem đóng góp **chỉ trong ban của mình**. |
| **Thành viên** | Các thành viên chính thức | Chỉ dùng trang cá nhân `/me`: xem việc được giao, đánh dấu đã xong, sửa SĐT và link Facebook. |
| **Ứng viên** | Người nộp đơn | Không cần tài khoản. Chỉ nộp đơn ở trang công khai. |

Các quyền có thể tick cho Ban chủ chốt:

| Quyền | Mở những mục |
|---|---|
| Quản lý sự kiện | Quản lý sự kiện |
| Tuyển thành viên | Quản lý tuyển gen (đợt tuyển, đơn ứng tuyển, phỏng vấn), Quản lý biểu mẫu, Import Excel, Kết nạp |
| Quản lý thành viên | Quản lý thành viên, Quản lý tài khoản, Quản lí ban |
| Gửi mail | Gửi mail, chọn Gmail gửi nhắc việc |
| Đối chiếu Facebook & khung avatar | Đối chiếu Facebook, Khung avatar, giao việc "tương tác bài viết"/"thay avatar" cho cả CLB |

Mục nào không có quyền sẽ **bị ẩn** khỏi menu. Vào thẳng đường link thì thấy thông báo "Bạn chưa được cấp quyền …".

---

## 2. Đăng nhập

- Vào **https://bit-bav.vercel.app/login** → bấm **Tiếp tục với Google** → chọn **đúng Gmail** mà CLB đã dùng để tạo tài khoản cho bạn.
- Web **không cho tự đăng ký**. Tài khoản do Ban chủ chốt (quyền Quản lý thành viên) hoặc Chủ nhiệm tạo (xem [mục 7](#7-thành-viên-tài-khoản-ban-quyền-quản-lý-thành-viên)).
- Sau khi đăng nhập:
  - Thành viên → trang cá nhân `/me`.
  - Ban chủ nhiệm / Ban chủ chốt → trang **Quản trị** (`/manage-clubs`). Nút "Quản trị" cũng có ở thanh trên cùng.

> Báo lỗi "không có tài khoản" hoặc vào được nhưng thấy "Chưa có CLB được gán": nhờ người quản lý thành viên kiểm tra email trong hồ sơ của bạn có đúng Gmail bạn vừa chọn không.

---

## 3. Trang cá nhân `/me` (mọi thành viên)

- **Hồ sơ**: tên, CLB, ban, chức danh, vai trò. Bạn tự sửa được **Số điện thoại** và **Link Facebook** → bấm **Lưu hồ sơ**.
  - Link Facebook phải dạng `https://facebook.com/...` hoặc `https://www.facebook.com/profile.php?id=...`. Link này dùng để đối chiếu react/bình luận và avatar, nên hãy điền đúng trang cá nhân của bạn.
- **Việc của tôi**:
  - *Đang chờ*: việc chưa xong, có nhãn "Còn N ngày" hoặc "Quá hạn". Làm xong thì bấm **Đánh dấu đã xong** (lỡ bấm thì **Bỏ đánh dấu**).
  - Việc "Tương tác bài viết" có nút **Mở bài viết**; việc "Thay avatar" có nút **Tạo avatar khung**.
  - *Đã xong*, *Chưa hoàn thành* (Ban chủ chốt đánh dấu bạn không làm), *Việc đã đóng*.

---

## 4. Ứng viên: nộp đơn

1. Vào trang chủ hoặc **https://bit-bav.vercel.app/positions** → chọn vị trí đang mở tuyển.
2. Điền biểu mẫu (họ tên, email, SĐT, MSSV, các câu hỏi riêng, chọn ca phỏng vấn nếu có) → gửi.
3. Mỗi email chỉ nộp được **một lần cho mỗi vị trí**.

Vị trí chỉ hiện khi đợt tuyển ở trạng thái **Đang mở** và hôm nay nằm trong khoảng ngày bắt đầu – kết thúc.

> Khuyến nghị: ghi chú trong form "Vui lòng dùng Gmail" — sau khi trúng tuyển, thành viên đăng nhập bằng đúng Gmail này.

---

## 5. Trang quản trị: tổng quan

Menu bên trái (tùy quyền mà thấy hay không):

| Mục | Dùng để |
|---|---|
| Tổng quan | Trang đầu quản trị |
| Quản lý tài khoản | Gắn/tạo tài khoản đăng nhập cho từng thành viên |
| Quản lý thành viên | Danh sách thành viên, thông tin, quyền; import danh sách từ Excel/Google Sheet ([mục 7.4](#74-import-thành-viên-từ-excelgoogle-sheet)) |
| Quản lí ban | Các ban của CLB (tên, mô tả, ảnh) |
| Nhiệm kỳ | Chuyển giao Ban chủ nhiệm / Ban chủ chốt hằng năm |
| Giao việc | Giao việc có hạn chót, nhắc hạn qua Gmail |
| Đóng góp | Bảng thống kê ai làm việc đúng hạn, ai bỏ lỡ |
| Đối chiếu Facebook | Kiểm tra ai đã react/bình luận/thay avatar |
| Khung avatar | Tải khung avatar sự kiện |
| Quản lý sự kiện | Sự kiện hiện ở trang công khai |
| Quản lý tuyển gen | Đợt tuyển, đơn ứng tuyển, phỏng vấn |
| Quản lý biểu mẫu | Mẫu câu hỏi dùng khi tạo biểu mẫu ứng tuyển |
| Gửi mail | Gửi mail hàng loạt qua Gmail của CLB |

Thanh bên hiện vai trò, chức danh và nhãn **Chủ nhiệm** (nếu có).

---

## 6. Tuyển thành viên (quyền "Tuyển thành viên")

### 6.1. Chuẩn bị (làm một lần)
1. **Quản lý biểu mẫu**: soạn mẫu câu hỏi (họ tên, email, SĐT, MSSV, lớp, link Facebook, câu hỏi riêng…) → **Đặt làm mặc định** cho mẫu hay dùng.
2. **Quản lí ban**: kiểm tra đủ các ban.

### 6.2. Mở một đợt tuyển
1. **Quản lý tuyển gen → Quản lý đợt tuyển → Tạo đợt tuyển**: nhập tên, mô tả, ngày bắt đầu/kết thúc, trạng thái (**Nháp** khi đang soạn).
2. **+ Thêm vị trí** cho từng ban.
3. Ở mỗi vị trí, tạo **Biểu mẫu ứng tuyển** từ mẫu → chỉnh câu hỏi (kéo ⠿ hoặc ↑ ↓ để đổi thứ tự).
4. Đổi trạng thái đợt sang **Đang mở** → **Lưu đợt tuyển**. Vị trí xuất hiện ở trang công khai.
5. Hết hạn tuyển → đổi sang **Đã đóng**; xong hẳn → **Hoàn tất**.

### 6.3. Phỏng vấn
1. **Quản lý phỏng vấn → Tạo ca phỏng vấn**: vị trí, vòng (1, 2…), giờ, địa điểm/link họp, sức chứa. Ứng viên chọn ca ngay trong form.
2. Thêm ứng viên vào ca (nếu cần), thêm thành viên hỗ trợ ca.
3. Sau phỏng vấn, với mỗi ứng viên ghi **Kết quả** (Chờ / Đạt / Không đạt / Cân nhắc), **điểm**, **nhận xét** → **Lưu đánh giá**.

### 6.4. Duyệt đơn và kết nạp
1. **Quản lý đơn ứng tuyển**: lọc theo đợt, ban; xem câu trả lời; đổi **Trạng thái** đơn (Mới nộp → Đang xét → Phỏng vấn → **Đạt** / Không đạt).
2. Qua đủ vòng: đặt đơn là **Đạt**.
3. Tick các đơn **Đạt** → bấm **Kết nạp**. Hệ thống tạo hồ sơ thành viên (vai trò Thành viên, đúng ban của vị trí, lấy email/SĐT/MSSV/link Facebook từ đơn). Đơn có nhãn **Đã kết nạp**. Bấm lại không tạo trùng.
4. Cấp tài khoản cho thành viên mới: xem [mục 7.2](#72-cấp-tài-khoản-đăng-nhập).

### 6.5. Import đơn từ Excel/CSV
Dùng khi CLB thu đơn bằng Google Form/Sheet.
1. Ở **Quản lý đơn ứng tuyển** (hoặc **Quản lý phỏng vấn**): chọn đúng **đợt tuyển** → **Import Excel** → chọn file `.xlsx`/`.csv` (tối đa 5 MB, chỉ đọc sheet đầu).
2. Ghép từng cột với: Họ tên, Email, Điện thoại, Mã sinh viên, Lớp, **Vị trí tuyển** (bắt buộc), Ca phỏng vấn, **Câu hỏi riêng**, hoặc Bỏ qua.
3. **Xác nhận import**. Kết quả: "Đã import X, bỏ qua Y đơn trùng".
- Vị trí/ca chưa có sẽ được tạo; ca mới có **giờ tạm**, nhớ sửa ở màn Phỏng vấn.
- Đơn trùng email trong cùng vị trí bị bỏ qua (dòng không có email thì không lọc trùng).
- Đợt **Đang mở**: không thêm được câu hỏi mới vào biểu mẫu đang nhận đơn. Đóng đợt trước, hoặc bỏ các cột câu hỏi chưa có.
- Lỗi ở một dòng → cả file không ghi gì, thông báo cho biết "Dòng N: …".

---

## 7. Thành viên, tài khoản, ban (quyền "Quản lý thành viên")

### 7.1. Hồ sơ thành viên
**Quản lý thành viên**: thêm/sửa họ tên, MSSV, lớp, **email (Gmail)**, SĐT, link Facebook, ban, chức danh, trạng thái hoạt động.
- Đổi **vai trò** và **quyền**: chỉ **Chủ nhiệm**.
- Bật/tắt hoạt động, xóa, đổi ban của **Ban chủ nhiệm / Ban chủ chốt**: chỉ **Chủ nhiệm**. Với thành viên thường, người có quyền Quản lý thành viên làm được.

### 7.2. Cấp tài khoản đăng nhập
- **Cách khuyên dùng — hàng loạt**: **Quản lý thành viên → Tạo tài khoản cho thành viên có email**. Mỗi thành viên đang hoạt động, có email, chưa có tài khoản sẽ được tạo tài khoản. **Không gửi mail**; báo thành viên vào web bấm **Tiếp tục với Google** bằng đúng Gmail đó.
- **Từng người**: **Quản lý tài khoản** → chọn thành viên → **Tạo tài khoản (đăng nhập bằng Google)**.
- Tránh dùng nút **Mời** (gửi mail mời): Supabase chỉ cho gửi khoảng 2 mail/giờ.
- Tạo/gắn tài khoản cho người thuộc Ban chủ nhiệm/Ban chủ chốt: chỉ **Chủ nhiệm**.

### 7.3. Ban
**Quản lí ban**: **+ Thêm ban**, sửa tên/mô tả/ảnh, **Xóa ban**.

### 7.4. Import thành viên từ Excel/Google Sheet
Dùng khi CLB đang quản lý thành viên trên Google Sheet, hoặc đầu năm cần nhập cả danh sách một lần.
1. **Chuẩn bị file**: ở Google Sheet chọn **Tệp → Tải xuống → Microsoft Excel (.xlsx)** hoặc **Giá trị phân tách bằng dấu phẩy (.csv)**. Dòng 1 là tiêu đề cột, tên và thứ tự cột tùy ý. File tối đa 5 MB, chỉ đọc sheet đầu, tối đa **1000 dòng**.
2. **Tạo ban trước**: tên ban trong file phải đúng như trên web (không phân biệt hoa/thường). Ban chưa có thì tạo ở **Quản lí ban**; hệ thống không tự tạo ban.
3. Vào **Quản lý thành viên → Import Excel** → chọn file.
4. **Ghép cột**: hệ thống tự đoán theo tên cột (Họ tên, Mã sinh viên, Lớp, Email, Điện thoại, Link Facebook, Ban, Chức danh). Kiểm tra lại, sửa nếu sai; cột không cần thì chọn **Bỏ qua**. Bắt buộc ghép **Họ tên**; mỗi thuộc tính chỉ ghép một cột. Xem bảng **Xem trước** 5 dòng đầu để chắc chắn.
5. Bấm **Xác nhận import**. Kết quả: "Đã thêm X, cập nhật Y, không đổi Z".
- Người có **Mã sinh viên** trùng (hoặc, nếu không có Mã sinh viên, trùng **email**) với thành viên đã có trong CLB thì **cập nhật** người đó, không tạo thêm. Chỉ những ô có giá trị mới ghi đè; ô trống không xóa dữ liệu cũ.
- Người mới được thêm với vai trò **Thành viên**, đang hoạt động. File **không** đổi được vai trò, quyền, trạng thái hoạt động hay tài khoản; cấp vai trò và quyền ở mục **Nhiệm kỳ** ([mục 8](#8-nhiệm-kỳ-và-chuyển-giao-chỉ-chủ-nhiệm)).
- Với người thuộc Ban chủ nhiệm/Ban chủ chốt, chỉ **Chủ nhiệm** đổi được ban. Người khác import thì ban của họ được giữ nguyên, kết quả có dòng "Giữ nguyên ban của W người…".
- Lỗi ở một dòng (thiếu họ tên, email sai, ban chưa có, trùng MSSV/email trong file…) → cả file không ghi gì, thông báo cho biết "Dòng N: …" (không kể dòng tiêu đề). Sửa file rồi import lại.
- Xong thì cấp tài khoản đăng nhập hàng loạt: xem [mục 7.2](#72-cấp-tài-khoản-đăng-nhập).

---

## 8. Nhiệm kỳ và chuyển giao (chỉ Chủ nhiệm)

Làm mỗi năm khi chuyển giao. Ban chủ nhiệm và Ban chủ chốt chỉ được **xem**.

1. Đảm bảo người của khóa mới đã có hồ sơ **và tài khoản** (mục 7).
2. **Nhiệm kỳ → Tạo nhiệm kỳ nháp**: tên (vd "Nhiệm kỳ 2027–2028"), ngày.
3. Thêm từng người (hoặc **Lấy từ danh sách hiện tại** rồi sửa):
   - **Vai trò**: Ban chủ nhiệm / Ban chủ chốt.
   - **Chức danh**: Chủ nhiệm, Phó chủ nhiệm phụ trách Ban …, Trưởng ban …, Phó ban …
   - **Ban** phụ trách.
   - Ban chủ nhiệm: chọn **đúng một người làm Chủ nhiệm**.
   - Ban chủ chốt: tick **quyền** cho từng người.
4. **Lưu danh sách** → **Kích hoạt nhiệm kỳ** → xác nhận.

Khi kích hoạt:
- Người trong danh sách nhận vai trò/quyền mới; người được chọn trở thành **Chủ nhiệm mới**.
- **Mọi người khác (kể cả Chủ nhiệm cũ)** trở về Thành viên, mất quyền.
- Nhiệm kỳ cũ chuyển "Đã kết thúc" và được lưu làm lịch sử.

Nút kích hoạt bị khóa nếu chưa có đúng một Chủ nhiệm đang hoạt động và có tài khoản — để CLB luôn có người quản trị.

---

## 9. Giao việc và nhắc hạn

### 9.1. Chọn Gmail gửi nhắc (làm một lần)
Người có quyền Gửi mail (hoặc Ban chủ nhiệm):
1. Vào **Gửi mail** → **Kết nối / làm mới quyền Gmail** (đăng nhập Gmail của CLB, đồng ý quyền gửi mail).
2. Vào **Giao việc** → khung "Gmail gửi nhắc việc" → **Dùng Gmail của tôi để gửi nhắc**.

### 9.2. Giao việc
**Giao việc → Giao việc mới**:
- Tiêu đề, mô tả, **Hạn chót** (phải ở tương lai).
- **Loại việc**: Việc thường / Tương tác bài viết (nhập link bài Facebook) / Thay avatar (chọn khung).
- Người nhận: tick từng người, và/hoặc **Giao cho cả ban**, hoặc **Giao cho tất cả thành viên**.
- Ban chủ chốt chỉ thấy và giao được cho người **trong ban mình**. "Giao cho tất cả" chỉ dành cho Ban chủ nhiệm, hoặc người có quyền Đối chiếu Facebook với việc tương tác/thay avatar.

### 9.3. Theo dõi
- Mở một việc: thấy từng người nhận với trạng thái **Chờ / Xong / Chưa hoàn thành**, đổi trạng thái và ghi chú → **Lưu**.
- **Gửi nhắc ngay**: gửi mail nhắc cho người còn Chờ (bỏ qua người vừa được nhắc trong 10 phút).
- **Đóng việc** khi hủy/ngừng theo dõi (người còn "Chờ" của việc đã đóng **không** bị tính bỏ lỡ). Muốn ghi nhận ai không làm thì đánh dấu **Chưa hoàn thành** trước khi đóng.
- **Xóa việc**: có hộp xác nhận.

### 9.4. Nhắc tự động
Mỗi sáng **8:00** hệ thống gửi **một mail gộp** cho mỗi người: việc sắp tới hạn trong 36 giờ và việc vừa quá hạn (trong 7 ngày). Mỗi việc chỉ nhắc một lần cho mỗi loại. Thành viên phải có **email** trong hồ sơ mới nhận được.

---

## 10. Đóng góp của thành viên

**Đóng góp**: chọn khoảng ngày (mặc định 90 ngày) → **Xem**.
- Cột: Được giao, Đúng hạn, Trễ, Bỏ lỡ, Đang chờ, **Tỉ lệ hoàn thành**.
- Nhãn **Cần nhắc nhở**: có từ 3 việc đã tới hạn và tỉ lệ dưới 50%. Lọc "Chỉ người cần nhắc nhở".
- Ban chủ chốt chỉ thấy thành viên ban mình.
- Bảng chỉ để tham khảo, **không tự xử lý ai**. Xử lý thành viên không hoạt động (nhắc nhở, chuyển "ngừng hoạt động") do Ban chủ nhiệm quyết, làm ở Quản lý thành viên.

---

## 11. Đối chiếu tương tác Facebook (quyền "Đối chiếu Facebook")

Kiểm tra ai đã react/bình luận bài của CLB, hoặc ai đã thay avatar khung.

### 11.1. Cài bookmarklet (một lần)
**Đối chiếu Facebook** → kéo nút xanh lên **thanh dấu trang** của trình duyệt (Ctrl + Shift + B để hiện thanh này). Không kéo được thì **Sao chép mã**, tạo dấu trang mới và dán mã vào ô địa chỉ (URL).

### 11.2. Mỗi lần đối chiếu
1. Tạo việc loại **Tương tác bài viết** (hoặc **Thay avatar**) giao cho thành viên (mục 9).
2. Chọn đúng **CLB** ở thanh bên của web.
3. Trên Facebook (đã đăng nhập), mở bài viết → bấm vào số cảm xúc để mở hộp **"Tất cả cảm xúc"** (hoặc mở phần bình luận) → **cuộn hết danh sách**.
4. Bấm dấu trang vừa cài. Một tab mới của web mở ra với kết quả.
5. Kiểm tra 3 nhóm:
   - **Khớp**: thành viên tìm thấy.
   - **Không khớp**: người chưa nhận ra (người ngoài CLB, hoặc thành viên chưa điền link Facebook) → **Gắn với thành viên** để lần sau tự khớp.
   - **Thành viên chưa thấy**.
6. Chọn việc cần đánh dấu → tick người (hoặc **Chọn hết người khớp** / **Chọn người có vẻ đã thay khung**) → **Đánh dấu xong cho N người**. Quét thêm phần bình luận rồi đánh dấu tiếp nếu cần.

Lưu ý:
- Dữ liệu quét chỉ nằm trên trình duyệt của bạn, không qua máy chủ nào. Chỉ dùng kết quả do **chính bạn vừa quét**.
- Khi quét bình luận, người được @nhắc tên cũng bị tính.
- Nhận diện avatar khung là **thử nghiệm**; nếu báo "Không đọc được ảnh" thì tick bằng tay.
- Gắn nhầm tài khoản: mục **Tài khoản Facebook đã gắn** → **Gỡ**.
- Facebook đổi giao diện có thể làm bookmarklet chạy sai; báo người phụ trách kỹ thuật.

---

## 12. Khung avatar sự kiện (quyền "Đối chiếu Facebook")

1. **Khung avatar** → nhập tên → chọn file **PNG vuông** (400–2048 px, tối đa 2 MB, phần giữa trong suốt) → tải lên.
2. Bấm **Sao chép link** và gửi cho thành viên (link dạng `https://bit-bav.vercel.app/frames/...`), hoặc tạo việc **Thay avatar** chọn khung này — thành viên sẽ thấy nút **Tạo avatar khung** ở `/me`.
3. Thành viên mở link (không cần đăng nhập) → chọn ảnh → kéo, phóng to để căn → **Tạo ảnh 1080×1080** → **Tải ảnh PNG về máy** (điện thoại: nhấn giữ ảnh → Lưu ảnh). Ảnh được ghép ngay trên máy, không tải lên đâu.
4. Kiểm tra ai đã thay: dùng [mục 11](#11-đối-chiếu-tương-tác-facebook-quyền-đối-chiếu-facebook) với việc "Thay avatar".

---

## 13. Sự kiện (quyền "Quản lý sự kiện")

**Quản lý sự kiện** → **+ Thêm sự kiện**: tiêu đề, mô tả, ảnh, thứ tự hiển thị. Sự kiện hiện ở trang **Sự kiện** công khai. **Xóa sự kiện** khi không cần.

---

## 14. Gửi mail hàng loạt (quyền "Gửi mail")

1. **Gửi mail** → **Kết nối / làm mới quyền Gmail** (lần đầu).
2. Kéo thả file danh sách người nhận (Excel/CSV, có cột email) hoặc **Import đơn ứng tuyển** từ một đợt tuyển.
3. Soạn tiêu đề và nội dung; chèn **biến** (vd tên, vị trí) bằng **Thêm biến**; đính kèm ảnh hoặc file nếu cần (cột `attachment_url` / `drive_id` cho file riêng từng người).
4. Xem trước → **Gửi hàng loạt**, theo dõi **Tiến độ**.

Giới hạn của Google: Gmail cá nhân khoảng 500 mail/ngày, tài khoản Google Workspace khoảng 2.000 mail/ngày.

---

## 15. Câu hỏi thường gặp

**Trang vị trí tuyển báo "chưa có ban nào mở tuyển"?** Đợt tuyển chưa ở trạng thái Đang mở, hoặc đã quá ngày kết thúc.

**Thành viên không đăng nhập được?** Kiểm tra: (1) đã được tạo tài khoản chưa (Quản lý tài khoản); (2) email trong hồ sơ có đúng Gmail họ chọn khi bấm "Tiếp tục với Google"; (3) hồ sơ còn "đang hoạt động".

**Không nhận được mail nhắc việc?** Kiểm tra: đã chọn Gmail gửi nhắc ở màn Giao việc; người nhận có email trong hồ sơ; xem thư mục Spam.

**Thấy "Bạn chưa được cấp quyền …"?** Nhờ Chủ nhiệm tick quyền tương ứng ở Nhiệm kỳ hoặc Quản lý thành viên.

**Muốn quay lại phiên bản web cũ khi bản mới lỗi?** Vercel → Deployments → chọn bản cũ đang chạy tốt → ⋯ → **Promote** / **Instant Rollback**.

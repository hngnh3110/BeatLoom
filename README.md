## Dùng Mac làm máy chủ cho điện thoại và máy khác

1. Cài `cloudflared` bằng `brew install cloudflared` (Mac hiện tại đã được cài).
2. Mở **Start BEATLOOM Remote.command**. Máy chủ cục bộ và kết nối HTTPS chạy nền.
3. Trên Mac, vào `http://127.0.0.1:3000`, chọn **Thiết bị khác**, quét QR hoặc sao chép liên kết riêng sang thiết bị của bạn.
4. QR mở GitHub Pages, kèm địa chỉ máy chủ và khóa trong fragment. Trình duyệt xóa fragment sau khi nhận và giữ khóa trong phiên. Không gửi khóa lên GitHub.
5. **Stop BEATLOOM Remote.command** chỉ tắt kết nối từ xa; **Stop BEATLOOM.command** dừng cả máy chủ.

Mac phải bật, có Internet và mở nắp. Tiến trình kết nối dùng `caffeinate` để ngăn ngủ do không thao tác; không ngăn tắt máy, ngủ thủ công hoặc đóng nắp. Chuyển đổi YouTube và dữ liệu đều nằm trên Mac, dùng chung trên các thiết bị đã kết nối.

Cloudflare Quick Tunnel miễn phí, không cần tài khoản/thẻ, nhưng URL có thể đổi mỗi lần chạy lại và không cam kết độ ổn định. Khi đó quét QR mới: trang GitHub tự nhận địa chỉ mới mà không cần triển khai lại. Đường dẫn GitHub không kèm QR sẽ dùng địa chỉ mặc định trong `public/remote-server.json` hoặc địa chỉ đã nhận trong phiên trình duyệt. Muốn đổi mặc định, cập nhật JSON này rồi triển khai Pages.

Liên kết QR cho phép quản lý toàn bộ thư viện, chỉ chia sẻ cho thiết bị của bạn. Khóa nằm tại `.logs/connection.key`, không đưa lên Git. Cổng 3000 chỉ phục vụ máy này; đường kết nối từ xa trỏ vào cổng 3001, luôn yêu cầu khóa cho API/thư viện và chặn các điểm cấp khóa. File nhạc dùng URL ký có thời hạn để hỗ trợ phát/tua.

# BEATLOOM · Không gian âm nhạc của bạn

Ứng dụng nghe nhạc cá nhân, giao diện tiếng Việt, chạy trên máy của bạn. Nhạc và danh sách phát được lưu cục bộ, không phụ thuộc dịch vụ nghe nhạc bên ngoài.

## Sử dụng ngay trên máy này

1. Mở **Start BEATLOOM.command** bằng cách nhấp đúp.
2. Trình mở nhanh đưa bạn đến **http://127.0.0.1:3000** để sử dụng trực tiếp trên máy, bao gồm Safari. Trang **https://hngnh3110.github.io/BeatLoom/** vẫn có nút kết nối máy tính nếu trình duyệt cho phép.
3. Bấm **Thêm nhạc** hoặc kéo file vào vùng tải lên.

Ứng dụng chạy nền sau khi đóng cửa sổ Terminal. Mở **Stop BEATLOOM.command** để dừng. Sau khi khởi động lại máy, mở lại **Start BEATLOOM.command**. Trình mở nhanh dùng Node.js có sẵn hoặc môi trường Node.js đi kèm Codex trên máy hiện tại.

## GitHub Pages + máy tính hiện tại

Giao diện chạy tại [BEATLOOM](https://hngnh3110.github.io/BeatLoom/). Máy chủ Node.js, SQLite, file nhạc, yt-dlp và FFmpeg chạy trên máy tính này ở `127.0.0.1:3000`.

- Mở **Start BEATLOOM.command** mỗi khi cần sử dụng. Giữ máy tính thức và có mạng để chuyển đổi YouTube.
- Lần đầu vào trang, bấm **Kết nối máy tính**. Nếu Chrome hỏi quyền truy cập mạng cục bộ, chọn **Cho phép**. Nếu quyền bị từ chối, cấp lại trong cài đặt trang hoặc dùng **Mở bản trên máy**.
- Máy chủ chỉ lắng nghe địa chỉ loopback; trang trên điện thoại hoặc máy khác không kết nối được tới máy này. Không cần Render hoặc gói máy chủ trả phí.
- Nhạc và danh sách phát nằm trong `uploads/` và `data/`. Không có chức năng đồng bộ lên GitHub; giữ bản sao các thư mục này để sao lưu.
- Khóa kết nối được tạo tự động trong `.logs/connection.key` (chỉ chủ máy đọc/ghi). Khóa không được đưa vào Git hoặc cấu hình Pages. Trang cất khóa trong phiên trình duyệt; phiên mới cần kết nối lại.
- API yêu cầu khóa; CORS chỉ cho phép nguồn GitHub Pages đã cấu hình. File nhạc dùng liên kết ký có hạn 24 giờ, hỗ trợ tua và tải FLAC.
- Khi máy chủ tắt, giao diện hiện hướng dẫn kết nối lại.

Chạy `npm run build:pages` để tạo `.pages/`. Workflow `.github/workflows/deploy.yml` tự xuất bản thư mục này khi đẩy `main`. Mọi đường dẫn giao diện đều tương đối để chạy được dưới `/BeatLoom/`; chỉ mã giao diện được xuất bản. Không thêm file nhạc, cơ sở dữ liệu hoặc khóa vào `public/`.

Các file âm thanh kiểm thử được tạo trong thư mục tạm và tự xóa, không đưa vào thư viện thật.

## Tính năng

- Giao diện tông đen–xám, thích ứng máy tính và điện thoại, không cần tải font/ảnh bên ngoài.
- Tải nhiều file cùng lúc, kéo thả, hiển thị tiến độ truyền và trạng thái đọc metadata.
- Hỗ trợ MP3, FLAC, WAV, OGG, M4A, AAC, OPUS, WEBM; tối đa 200 MB/file và 50 file/lần.
- Đọc tên bài, nghệ sĩ, album và thời lượng từ file; giữ đúng tên tiếng Việt; loại file giả/hỏng và dọn file bị từ chối.
- Phát/tạm dừng, trước/sau, tua, âm lượng, tắt tiếng; xáo trộn; lặp toàn bộ hoặc một bài.
- Hàng đợi hiển thị thứ tự phát thực tế và cho phép chọn một bài bất kỳ.
- Các vạch phổ âm thanh phản ứng với âm thanh thật qua Web Audio API; tôn trọng cài đặt giảm chuyển động.
- Yêu thích và nghe gần đây lưu trong SQLite.
- Tìm kiếm theo bài hát/nghệ sĩ/album, hỗ trợ tiếng Việt không dấu; sắp xếp tên, nghệ sĩ hoặc thời lượng.
- Tạo, đổi tên, xóa danh sách phát; chọn nhiều bài để thêm; bỏ bài khỏi playlist mà vẫn giữ file nhạc.
- Đổi thứ tự bài trong playlist bằng mũi tên hoặc kéo thả khi chọn **Thứ tự danh sách** và không lọc tìm kiếm.
- Chỉnh sửa tên bài, nghệ sĩ và album bằng nút bút chì (chỉ cập nhật thông tin trong thư viện, không ghi lại tag file gốc).
- Ghi nhớ bài đang chọn, vị trí tua, hàng đợi, âm lượng và chế độ phát trên trình duyệt; khi tải lại trang, nhạc chờ người dùng bấm Phát.
- Điều khiển từ phím media/hệ điều hành trên trình duyệt có Media Session API.
- Hộp thoại có điều hướng bàn phím và xác nhận trước khi xóa dữ liệu.

Phím tắt khi không nhập liệu hoặc chọn nút: **Space** phát/tạm dừng, **← / →** tua 5 giây, **M** bật/tắt tiếng, **/** tìm kiếm, **Esc** đóng hộp thoại/hàng đợi/menu.

Khả năng phát từng codec tùy trình duyệt. MP3 và WAV là lựa chọn tương thích rộng. WMA không còn được nhận tải lên vì trình duyệt phổ biến không phát trực tiếp định dạng này.

## Cài đặt trên máy khác

Yêu cầu Node.js 22 trở lên (đã xác minh bằng Node.js 24), npm hoặc pnpm. `better-sqlite3` có thể cần công cụ biên dịch C++; trên macOS dùng Xcode Command Line Tools.

```sh
cd music-player
npm install
npm start
```

Hoặc dùng phiên bản phụ thuộc được khóa sẵn:

```sh
pnpm install --frozen-lockfile
pnpm start
```

Cổng mặc định: **3000**. Đổi cổng: `PORT=8080 npm start`. Mặc định chỉ lắng nghe trên `127.0.0.1`, dùng trên cùng máy. Đây là ứng dụng cá nhân, chưa có đăng nhập hay phân quyền và chưa được triển khai công khai lên Internet.

## YouTube → FLAC

Chọn **YouTube → FLAC** ở thanh bên, dán liên kết video và bấm **Chuyển sang FLAC**. Trên điện thoại, mở menu để thấy mục này.

- Tự chọn luồng âm thanh tốt nhất hiện có, chuyển thành FLAC và thêm vào thư viện.
- Giữ tên bài/nghệ sĩ từ metadata YouTube; hiển thị các bước đọc video, tải âm thanh và chuyển đổi.
- Có nút **Hủy chuyển đổi**, **Thử lại**, **Phát bài hát** và **Tải file FLAC**.
- Đóng cửa sổ chuyển đổi hoặc tải lại trang không làm dừng công việc đang chạy trên máy chủ.
- Tối đa 5 video trong hàng đợi, xử lý lần lượt; mỗi video tối đa 60 phút, 200 MB nguồn và 500 MB FLAC.
- Chỉ chuyển một video mỗi liên kết, không tải toàn bộ playlist hay livestream đang diễn ra.
- Video đã nhập được nhận diện để tránh tạo bài trùng. Nếu xóa bài khỏi thư viện, có thể nhập lại video đó.
- FLAC không cải thiện chất lượng nguồn YouTube vốn đã được nén mất dữ liệu.
- Video riêng tư, yêu cầu đăng nhập/xác minh, bị gỡ hoặc bị YouTube giới hạn có thể không tải được. Ứng dụng không sử dụng cookie/tài khoản trình duyệt.

Máy hiện tại đã được cài đầy đủ. Trên máy khác, cài phụ thuộc Node.js và Python 3.10+ rồi chạy:

```sh
npm install
npm run setup:youtube
npm start
```

Bộ tải [yt-dlp](https://github.com/yt-dlp/yt-dlp) được cài trong `.tools/python/`; [FFmpeg](https://ffmpeg.org/ffmpeg.html) được cung cấp bởi gói `ffmpeg-static`. Có thể đặt `YTDLP_PATH` và `FFMPEG_PATH` thành đường dẫn tuyệt đối tới các bản cài riêng. `IMPORT_DIR` đổi thư mục làm việc tạm (mặc định `.imports/`).

Nếu YouTube thay đổi cách cung cấp video, cập nhật yt-dlp trong môi trường riêng rồi khởi động lại BEATLOOM:

```sh
.tools/python/bin/python -m pip install --upgrade 'yt-dlp[default]'
```

Lịch sử chuyển đổi lưu trong bảng `youtube_imports` của SQLite. File tạm được dọn khi hoàn tất, hủy hoặc gặp lỗi. Nếu máy chủ dừng/khởi động lại giữa chừng, công việc được đánh dấu thất bại để người dùng thử lại, không tự tiếp tục âm thầm.

Kiểm thử: `npm run test:youtube` kiểm tra URL, chuyển file thật qua FFmpeg, metadata, chống trùng, lỗi, hủy tiến trình, hàng đợi và giao diện. `npm run test:all` chạy toàn bộ kiểm thử (cần Google Chrome). Đã xác minh thêm luồng mạng thật với một video YouTube công khai dài 19 giây, đầu ra là FLAC hợp lệ; dữ liệu kiểm thử không được thêm vào thư viện cá nhân.

| Phương thức | Đường dẫn | Chức năng |
|---|---|---|
| GET | `/api/imports/capabilities` | Kiểm tra công cụ chuyển đổi đã sẵn sàng |
| GET | `/api/imports` | 30 lượt chuyển đổi gần nhất |
| POST | `/api/imports/youtube` | Thêm liên kết `{url}` vào hàng đợi |
| GET | `/api/imports/:id` | Trạng thái/tiến độ và bài hát đã tạo |
| DELETE | `/api/imports/:id` | Hủy lượt chuyển đổi đang chờ/đang chạy |

## Dữ liệu và sao lưu

- `data/music.db`: bài hát, yêu thích, lịch sử nghe và playlist.
- `uploads/`: các file nhạc gốc với tên lưu trữ ngẫu nhiên.
- Bộ nhớ trình duyệt: trạng thái phát và âm lượng.
- `.logs/server.log`: log khởi động và lỗi; `.logs/server.pid`: tiến trình do trình mở nhanh tạo.
- `.backups/before-upgrade-20260914.tar.gz`: mã nguồn trước lần nâng cấp này.

**Dừng ứng dụng trước**, sau đó sao chép toàn bộ thư mục `data/` và `uploads/` để sao lưu. Khôi phục hai thư mục vào cùng vị trí trên máy mới rồi cài phụ thuộc. Schema mới được thêm bằng migration không xóa dữ liệu cũ.

## Kiểm thử

```sh
npm test
npm run test:ui
```

Kiểm thử API dùng Node Test Runner và cơ sở dữ liệu tạm, kiểm tra upload thật/giả, metadata tiếng Việt, dữ liệu đầu vào, yêu thích, lịch sử, playlist, cập nhật thứ tự nguyên tử, xóa liên kết và HTTP byte-range để tua nhạc.

Kiểm thử giao diện dùng Playwright + Google Chrome đã cài trên máy. Có thể chỉ định trình duyệt Chromium khác bằng `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/duong/dan/chromium npm run test:ui`. Các bài kiểm thử thao tác qua giao diện trên màn hình máy tính/điện thoại, xác minh phát nhạc thật, tua, khôi phục trạng thái, các chế độ lặp, playlist và không có lỗi JavaScript. Ảnh kiểm tra nằm trong `.test-results/`.

Các bài kiểm thử dùng thư mục dữ liệu và cổng tạm, không thay đổi thư viện thật.

## API

| Phương thức | Đường dẫn | Chức năng |
|---|---|---|
| GET | `/api/health` | Trạng thái hệ thống |
| GET | `/api/songs` | Thư viện đầy đủ |
| POST | `/api/songs/upload` | Tải file, trường multipart `files` |
| PATCH | `/api/songs/:id` | Sửa `{title, artist, album, favorite}` |
| POST | `/api/songs/:id/played` | Ghi nhận lượt nghe |
| DELETE | `/api/songs/:id` | Xóa file và bài hát |
| GET / POST | `/api/playlists` | Liệt kê / tạo `{name}` |
| GET / PUT / DELETE | `/api/playlists/:id` | Chi tiết / đổi tên / xóa |
| POST | `/api/playlists/:id/songs` | Thêm `{songId}` hoặc `{songIds: [...]}`; bỏ qua trùng lặp |
| DELETE | `/api/playlists/:id/songs/:songId` | Bỏ bài khỏi playlist |
| PUT | `/api/playlists/:id/reorder` | Thay thứ tự bằng toàn bộ `{songIds: [...]}` |

Có thể dùng `DATA_DIR` và `UPLOAD_DIR` để cấu hình vị trí dữ liệu. Việc ghi metadata là đồng bộ qua SQLite; xử lý playlist hàng loạt và đổi thứ tự được thực hiện trong transaction.

# BeatLoom
Web nghe nhạc, đề phòng trường hợp nhạc đã bị ẩn

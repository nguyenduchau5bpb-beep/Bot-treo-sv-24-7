 #!/usr/bin/env bash

# Chạy server Python ngầm để chống sleep trên Render
python3 server.py &

# Khởi động file index.js chính của bot Discord
node index.js

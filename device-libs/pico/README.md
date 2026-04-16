# Pico Library Folder

추가 MicroPython 라이브러리를 자동 업로드하려면 이 폴더에 `mylib.py` 형태로 넣어두세요.

예시:

- `device-libs/pico/neopixel.py`
- `device-libs/pico/dht.py`

코드에서 `import neopixel` 또는 `import dht`가 보이면 업로드 전에 자동으로 `lib/` 아래로 같이 전송됩니다.

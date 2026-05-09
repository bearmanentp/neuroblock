(function () {
  const STORAGE_KEY = "neuro-block-users";
  const SESSION_COOKIE = "neuro_block_user";
  const FIRMWARE_KEY = "neuro-block-firmware";
  const LANGUAGE_KEY = "neuro-block-language";
  const PICO_USB_FILTERS = [
    { usbVendorId: 0x2e8a },
    { usbVendorId: 0x239a }
  ];
  const DEFAULT_CODE = [
    "from machine import Pin, PWM, ADC",
    "from utime import sleep_ms",
    "",
    "led = Pin('LED', Pin.OUT)",
    "",
    "while True:",
    "    led.toggle()",
    "    print('Hello Pico')",
    "    sleep_ms(500)"
  ].join("\n");

  const state = {
    user: null,
    deviceTarget: "pico",
    language: localStorage.getItem(LANGUAGE_KEY) || "ko",
    arduinoBoards: [],
    workspaceData: null,
    selectedLocalPath: "/main.py",
    activeEditorPath: "/main.py",
    selectedPicoPath: "",
    openFolders: new Set(["/"]),
    blocklyWorkspace: null,
    picoEntries: [],
    pico: {
      port: null,
      reader: null,
      writer: null,
      connected: false,
      info: null
    }
  };

  const el = {
    authForm: document.getElementById("authForm"),
    usernameInput: document.getElementById("usernameInput"),
    passwordInput: document.getElementById("passwordInput"),
    logoutButton: document.getElementById("logoutButton"),
    sessionStatus: document.getElementById("sessionStatus"),
    picoStatus: document.getElementById("picoStatus"),
    deviceTarget: document.getElementById("deviceTarget"),
    languageSelect: document.getElementById("languageSelect"),
    deviceModeLabel: document.getElementById("deviceModeLabel"),
    codeModeLabel: document.getElementById("codeModeLabel"),
    deviceStatusBox: document.getElementById("deviceStatusBox"),
    deviceHint: document.getElementById("deviceHint"),
    arduinoBoardSearchInput: document.getElementById("arduinoBoardSearchInput"),
    arduinoBoardList: document.getElementById("arduinoBoardList"),
    refreshArduinoBoardsButton: document.getElementById("refreshArduinoBoardsButton"),
    arduinoFqbnInput: document.getElementById("arduinoFqbnInput"),
    arduinoPortInput: document.getElementById("arduinoPortInput"),
    serialPortList: document.getElementById("serialPortList"),
    localTree: document.getElementById("localTree"),
    picoTree: document.getElementById("picoTree"),
    activeFolderLabel: document.getElementById("activeFolderLabel"),
    activeFileLabel: document.getElementById("activeFileLabel"),
    codeHighlight: document.getElementById("codeHighlight"),
    pythonEditor: document.getElementById("pythonEditor"),
    consoleOutput: document.getElementById("consoleOutput"),
    boardSelect: document.getElementById("boardSelect"),
    firmwareVersionInput: document.getElementById("firmwareVersionInput"),
    firmwareUrlInput: document.getElementById("firmwareUrlInput"),
    firmwarePresetList: document.getElementById("firmwarePresetList"),
    blocksView: document.getElementById("blocksView"),
    codeView: document.getElementById("codeView"),
    showBlocksTab: document.getElementById("showBlocksTab"),
    showCodeTab: document.getElementById("showCodeTab"),
    refreshPortsButton: document.getElementById("refreshPortsButton"),
    uploadDeviceButton: document.getElementById("uploadDeviceButton"),
    syncLibrariesButton: document.getElementById("syncLibrariesButton")
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    try {
      bootBlockly();
    } catch (error) {
      showBlocklyError(error);
    }
    bindEvents();
    restoreSession();
    renderAll();
    refreshSerialPorts();
    log("블록키 토니 준비 완료");
  }

  function bootBlockly() {
    if (!window.Blockly || !window.python || !window.python.pythonGenerator) {
      log("Blockly 로딩 실패");
      return;
    }

    if (state.language === "ko") Blockly.setLocale(Blockly.Msg.ko || Blockly.Msg);
    localizeToolbox();
    try {
      if (window.NeuroBlockRuntime?.register) {
        window.NeuroBlockRuntime.register(Blockly, python.pythonGenerator, state.language);
      } else {
        defineCustomBlocks();
      }
    } catch (error) {
      console.error(error);
      log(`커스텀 블록 등록 오류: ${error.message || error}`);
    }
    pruneUnavailableToolboxBlocks();

    state.blocklyWorkspace = Blockly.inject("blocklyDiv", {
      toolbox: document.getElementById("toolbox"),
      trashcan: true,
      renderer: "zelos",
      grid: { spacing: 22, length: 3, colour: "#d8e2f1", snap: true },
      zoom: { controls: true, wheel: true, startScale: 0.92, maxScale: 1.6, minScale: 0.5 },
      move: { drag: true, wheel: true, scrollbars: true }
    });

    state.blocklyWorkspace.addChangeListener(() => {
      if (!state.blocklyWorkspace || state.blocklyWorkspace.isDragging()) return;
      updateCodePreviewFromBlocks();
    });

    window.addEventListener("resize", () => Blockly.svgResize(state.blocklyWorkspace));
    loadStarterBlocks();
    updateCodePreviewFromBlocks();
  }

  function pruneUnavailableToolboxBlocks() {
    document.querySelectorAll("#toolbox block[type]").forEach((block) => {
      const type = block.getAttribute("type");
      if (type && !Blockly.Blocks[type]) block.remove();
    });
  }

  function showBlocklyError(error) {
    console.error(error);
    const host = document.getElementById("blocklyDiv");
    if (host) {
      host.innerHTML = `<div class="blockly-error">Blockly 초기화 오류: ${escapeHtml(error.message || String(error))}</div>`;
    }
    log(`Blockly 초기화 오류: ${error.message || error}`);
  }

  function loadStarterBlocks() {
    const xmlText = `
      <xml xmlns="https://developers.google.com/blockly/xml">
        <block type="controls_repeat_ext" x="32" y="24">
          <value name="TIMES">
            <shadow type="math_number"><field name="NUM">5</field></shadow>
          </value>
          <statement name="DO">
            <block type="pico_led_write">
              <field name="STATE">TOGGLE</field>
              <next>
                <block type="pico_print">
                  <value name="TEXT">
                    <shadow type="text"><field name="TEXT">blink</field></shadow>
                  </value>
                  <next>
                    <block type="pico_sleep_ms">
                      <value name="MS">
                        <shadow type="math_number"><field name="NUM">500</field></shadow>
                      </value>
                    </block>
                  </next>
                </block>
              </next>
            </block>
          </statement>
        </block>
      </xml>`;
    Blockly.Xml.domToWorkspace(Blockly.utils.xml.textToDom(xmlText), state.blocklyWorkspace);
  }

  function defineCustomBlocks() {
    Blockly.defineBlocksWithJsonArray([
      { type: "pico_print", message0: "print %1", args0: [{ type: "input_value", name: "TEXT" }], previousStatement: null, nextStatement: null, colour: 20 },
      { type: "pico_sleep_ms", message0: "%1 ms wait", args0: [{ type: "input_value", name: "MS", check: "Number" }], previousStatement: null, nextStatement: null, colour: 20 },
      { type: "pico_led_write", message0: "builtin LED %1", args0: [{ type: "field_dropdown", name: "STATE", options: [["on", "ON"], ["off", "OFF"], ["toggle", "TOGGLE"]] }], previousStatement: null, nextStatement: null, colour: 0 },
      { type: "pico_pin_write_digital", message0: "digital write pin %1 value %2", args0: [{ type: "input_value", name: "PIN", check: "Number" }, { type: "field_dropdown", name: "VALUE", options: [["HIGH", "1"], ["LOW", "0"]] }], previousStatement: null, nextStatement: null, colour: 330 },
      { type: "pico_pin_read_digital", message0: "digital read pin %1", args0: [{ type: "input_value", name: "PIN", check: "Number" }], output: "Number", colour: 330 },
      { type: "pico_pwm_write", message0: "PWM pin %1 freq %2 duty %3", args0: [{ type: "input_value", name: "PIN", check: "Number" }, { type: "input_value", name: "FREQ", check: "Number" }, { type: "input_value", name: "DUTY", check: "Number" }], previousStatement: null, nextStatement: null, colour: 200 },
      { type: "pico_rgb_write", message0: "RGB pins R %1 G %2 B %3 values %4 %5 %6", args0: [{ type: "input_value", name: "R_PIN", check: "Number" }, { type: "input_value", name: "G_PIN", check: "Number" }, { type: "input_value", name: "B_PIN", check: "Number" }, { type: "input_value", name: "R_VAL", check: "Number" }, { type: "input_value", name: "G_VAL", check: "Number" }, { type: "input_value", name: "B_VAL", check: "Number" }], previousStatement: null, nextStatement: null, colour: 130 },
      { type: "pico_servo_write", message0: "servo pin %1 angle %2", args0: [{ type: "input_value", name: "PIN", check: "Number" }, { type: "input_value", name: "ANGLE", check: "Number" }], previousStatement: null, nextStatement: null, colour: 200 },
      { type: "pico_adc_read", message0: "ADC read pin %1", args0: [{ type: "input_value", name: "PIN", check: "Number" }], output: "Number", colour: 170 },
      { type: "pico_read_temperature", message0: "read onboard temperature", output: "Number", colour: 170 },
      { type: "pico_buzzer_tone", message0: "buzzer pin %1 freq %2 Hz duration %3 ms", args0: [{ type: "input_value", name: "PIN", check: "Number" }, { type: "input_value", name: "FREQ", check: "Number" }, { type: "input_value", name: "DURATION", check: "Number" }], previousStatement: null, nextStatement: null, colour: 45 }
    ]);

    const py = python.pythonGenerator;
    py.forBlock["pico_print"] = function (block, generator) {
      const text = generator.valueToCode(block, "TEXT", 0) || "''";
      return `print(${text})\n`;
    };
    py.forBlock["pico_sleep_ms"] = function (block, generator) {
      const ms = generator.valueToCode(block, "MS", 0) || "100";
      generator.definitions_.import_utime = "from utime import sleep_ms";
      return `sleep_ms(${ms})\n`;
    };
    py.forBlock["pico_led_write"] = function (block, generator) {
      ensureMachineImport(generator);
      generator.definitions_.builtin_led = "led = Pin('LED', Pin.OUT)";
      const stateValue = block.getFieldValue("STATE");
      if (stateValue === "ON") return "led.value(1)\n";
      if (stateValue === "OFF") return "led.value(0)\n";
      return "led.toggle()\n";
    };
    py.forBlock["pico_pin_write_digital"] = function (block, generator) {
      ensureMachineImport(generator);
      const pin = generator.valueToCode(block, "PIN", 0) || "15";
      return `Pin(${pin}, Pin.OUT).value(${block.getFieldValue("VALUE")})\n`;
    };
    py.forBlock["pico_pin_read_digital"] = function (block, generator) {
      ensureMachineImport(generator);
      const pin = generator.valueToCode(block, "PIN", 0) || "14";
      return [`Pin(${pin}, Pin.IN, Pin.PULL_UP).value()`, 0];
    };
    py.forBlock["pico_pwm_write"] = function (block, generator) {
      ensureMachineImport(generator);
      const pin = generator.valueToCode(block, "PIN", 0) || "15";
      const freq = generator.valueToCode(block, "FREQ", 0) || "1000";
      const duty = generator.valueToCode(block, "DUTY", 0) || "32768";
      return [`pwm = PWM(Pin(${pin}))`, `pwm.freq(${freq})`, `pwm.duty_u16(${duty})`].join("\n") + "\n";
    };
    py.forBlock["pico_rgb_write"] = function (block, generator) {
      ensureMachineImport(generator);
      const rPin = generator.valueToCode(block, "R_PIN", 0) || "0";
      const gPin = generator.valueToCode(block, "G_PIN", 0) || "1";
      const bPin = generator.valueToCode(block, "B_PIN", 0) || "2";
      const rVal = generator.valueToCode(block, "R_VAL", 0) || "65535";
      const gVal = generator.valueToCode(block, "G_VAL", 0) || "0";
      const bVal = generator.valueToCode(block, "B_VAL", 0) || "0";
      return [`rgb_r = PWM(Pin(${rPin}))`, `rgb_g = PWM(Pin(${gPin}))`, `rgb_b = PWM(Pin(${bPin}))`, "rgb_r.freq(1000)", "rgb_g.freq(1000)", "rgb_b.freq(1000)", `rgb_r.duty_u16(${rVal})`, `rgb_g.duty_u16(${gVal})`, `rgb_b.duty_u16(${bVal})`].join("\n") + "\n";
    };
    py.forBlock["pico_servo_write"] = function (block, generator) {
      ensureMachineImport(generator);
      const pin = generator.valueToCode(block, "PIN", 0) || "16";
      const angle = generator.valueToCode(block, "ANGLE", 0) || "90";
      return [`servo = PWM(Pin(${pin}))`, "servo.freq(50)", `servo.duty_u16(int(1802 + (${angle}) * (7864 - 1802) / 180))`].join("\n") + "\n";
    };
    py.forBlock["pico_adc_read"] = function (block, generator) {
      ensureMachineImport(generator);
      const pin = generator.valueToCode(block, "PIN", 0) || "26";
      return [`ADC(Pin(${pin})).read_u16()`, 0];
    };
    py.forBlock["pico_read_temperature"] = function (_block, generator) {
      ensureMachineImport(generator);
      return ["27 - (((ADC(4).read_u16() * 3.3 / 65535) - 0.706) / 0.001721)", 0];
    };
    py.forBlock["pico_buzzer_tone"] = function (block, generator) {
      ensureMachineImport(generator);
      generator.definitions_.import_utime = "from utime import sleep_ms";
      const pin = generator.valueToCode(block, "PIN", 0) || "15";
      const freq = generator.valueToCode(block, "FREQ", 0) || "440";
      const duration = generator.valueToCode(block, "DURATION", 0) || "200";
      return [`buzzer = PWM(Pin(${pin}))`, `buzzer.freq(${freq})`, "buzzer.duty_u16(32768)", `sleep_ms(${duration})`, "buzzer.duty_u16(0)", "buzzer.deinit()"].join("\n") + "\n";
    };
  }

  function ensureMachineImport(generator) {
    generator.definitions_.import_machine = "from machine import Pin, PWM, ADC";
  }

  function bindEvents() {
    el.authForm.addEventListener("submit", handleLogin);
    el.logoutButton.addEventListener("click", logout);
    el.deviceTarget.addEventListener("change", handleDeviceTargetChange);
    el.languageSelect.addEventListener("change", handleLanguageChange);
    document.getElementById("generatePythonButton").addEventListener("click", generateCodeForTarget);
    document.getElementById("saveLocalButton").addEventListener("click", saveActiveFile);
    document.getElementById("downloadFileButton").addEventListener("click", downloadActiveFile);
    document.getElementById("newFolderButton").addEventListener("click", createFolder);
    document.getElementById("newFileButton").addEventListener("click", createFile);
    document.getElementById("renameLocalButton").addEventListener("click", renameLocalEntry);
    document.getElementById("deleteLocalButton").addEventListener("click", deleteLocalEntry);
    document.getElementById("downloadFirmwareButton").addEventListener("click", downloadFirmware);
    document.getElementById("saveFirmwarePresetButton").addEventListener("click", saveFirmwarePreset);
    document.getElementById("connectButton").addEventListener("click", connectPico);
    document.getElementById("disconnectButton").addEventListener("click", disconnectPico);
    document.getElementById("runOnPicoButton").addEventListener("click", runOnPico);
    document.getElementById("saveToPicoButton").addEventListener("click", saveToPico);
    document.getElementById("refreshPicoButton").addEventListener("click", refreshPicoFiles);
    document.getElementById("loadFromPicoButton").addEventListener("click", loadFromPico);
    document.getElementById("renamePicoButton").addEventListener("click", renamePicoEntry);
    document.getElementById("deletePicoButton").addEventListener("click", deletePicoEntry);
    document.getElementById("newPicoFolderButton").addEventListener("click", createPicoFolder);
    document.getElementById("clearConsoleButton").addEventListener("click", () => { el.consoleOutput.textContent = ""; });
    el.refreshPortsButton.addEventListener("click", refreshSerialPorts);
    el.refreshArduinoBoardsButton.addEventListener("click", () => renderArduinoStatus(true));
    el.arduinoBoardSearchInput.addEventListener("input", renderArduinoBoardList);
    el.uploadDeviceButton.addEventListener("click", uploadToCurrentDevice);
    el.syncLibrariesButton.addEventListener("click", syncLibrariesForCurrentDevice);
    el.pythonEditor.addEventListener("input", handleEditorInput);
    el.pythonEditor.addEventListener("scroll", syncCodeHighlightScroll);
    el.showBlocksTab.addEventListener("click", () => showTab("blocks"));
    el.showCodeTab.addEventListener("click", () => showTab("code"));
    document.addEventListener("click", closeMenusOnOutsideClick);
    if (navigator.serial) {
      navigator.serial.addEventListener("connect", refreshSerialPorts);
      navigator.serial.addEventListener("disconnect", refreshSerialPorts);
    }
    bindPanelToggles();
  }

  function handleDeviceTargetChange() {
    state.deviceTarget = el.deviceTarget.value;
    renderSession();
    renderDeviceMode();
  }

  function handleLanguageChange() {
    state.language = el.languageSelect.value;
    localStorage.setItem(LANGUAGE_KEY, state.language);
    window.location.reload();
  }

  function localizeToolbox() {
    const labels = {
      ko: ["제어", "논리", "수학", "텍스트", "변수", "출력", "질문 / 답", "디지털 입출력", "PWM / RGB / Servo", "센서 입력"],
      en: ["Control", "Logic", "Math", "Text", "Variables", "Output", "Question / Answer", "Digital I/O", "PWM / RGB / Servo", "Sensor Input"]
    };
    document.querySelectorAll("#toolbox category").forEach((category, index) => {
      if (labels[state.language]?.[index]) category.setAttribute("name", labels[state.language][index]);
    });
  }

  function bindPanelToggles() {
    document.querySelectorAll("[data-panel-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const panel = button.closest("[data-collapsible]");
        if (!panel) return;
        panel.classList.toggle("is-collapsed");
        button.textContent = panel.classList.contains("is-collapsed") ? "열기" : "접기";
        if (!panel.classList.contains("is-collapsed") && state.blocklyWorkspace) {
          setTimeout(() => Blockly.svgResize(state.blocklyWorkspace), 0);
        }
      });
    });
  }

  function closeMenusOnOutsideClick(event) {
    document.querySelectorAll(".menu[open]").forEach((menu) => {
      if (!menu.contains(event.target)) menu.removeAttribute("open");
    });
  }

  function showTab(kind) {
    el.showBlocksTab.classList.toggle("active", kind === "blocks");
    el.showCodeTab.classList.toggle("active", kind === "code");
    el.blocksView.classList.toggle("visible", kind === "blocks");
    el.codeView.classList.toggle("visible", kind === "code");
    if (kind === "code") requestAnimationFrame(syncCodeHighlight);
    if (kind === "blocks" && state.blocklyWorkspace) {
      setTimeout(() => Blockly.svgResize(state.blocklyWorkspace), 0);
    }
  }

  function handleEditorInput() {
    const node = getNode(state.activeEditorPath);
    if (node && node.type === "file") node.content = el.pythonEditor.value;
    syncCodeHighlight();
  }

  function getUsers() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveUsers(users) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
  }

  function getDefaultWorkspaceData() {
    return {
      files: {
        "/": {
          type: "folder",
          children: {
            "main.py": { type: "file", content: DEFAULT_CODE }
          }
        }
      }
    };
  }

  function restoreSession() {
    const match = document.cookie.split("; ").find((entry) => entry.startsWith(`${SESSION_COOKIE}=`));
    const username = match ? decodeURIComponent(match.split("=")[1]) : "";
    const users = getUsers();
    if (username && users[username]) {
      state.user = username;
      state.workspaceData = users[username].workspace || getDefaultWorkspaceData();
    } else {
      state.workspaceData = getDefaultWorkspaceData();
    }
  }

  function handleLogin(event) {
    event.preventDefault();
    const username = el.usernameInput.value.trim();
    const password = el.passwordInput.value.trim();
    if (!username || !password) return alert("아이디와 비밀번호를 입력해주세요.");
    const users = getUsers();
    users[username] = normalizeUserRecord(users[username], password);
    if (String(users[username].password || "").trim() !== password) {
      return alert("비밀번호가 맞지 않습니다.");
    }
    state.user = username;
    state.workspaceData = users[username].workspace || getDefaultWorkspaceData();
    persistWorkspace();
    document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(username)}; path=/; max-age=${60 * 60 * 24 * 7}`;
    el.usernameInput.value = "";
    el.passwordInput.value = "";
    renderAll();
    log(`${username} 로그인 완료`);
  }

  function normalizeUserRecord(record, password) {
    if (!record) return { password, workspace: getDefaultWorkspaceData() };
    if (typeof record === "string") return { password: record.trim(), workspace: getDefaultWorkspaceData() };
    if (!record.password) record.password = password;
    if (!record.workspace) record.workspace = getDefaultWorkspaceData();
    return record;
  }

  function logout() {
    state.user = null;
    state.workspaceData = getDefaultWorkspaceData();
    state.selectedLocalPath = "/main.py";
    state.activeEditorPath = "/main.py";
    document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
    renderAll();
    log("로그아웃 완료");
  }

  function persistWorkspace() {
    if (!state.user) return;
    const users = getUsers();
    users[state.user] = users[state.user] || { password: "", workspace: getDefaultWorkspaceData() };
    users[state.user].workspace = state.workspaceData;
    saveUsers(users);
  }

  function splitPath(path) {
    return path.split("/").filter(Boolean);
  }

  function getNode(path) {
    const parts = splitPath(path);
    let current = state.workspaceData.files["/"];
    if (!parts.length) return current;
    for (const part of parts) {
      if (!current.children || !current.children[part]) return null;
      current = current.children[part];
    }
    return current;
  }

  function getParentPath(path) {
    const parts = splitPath(path);
    parts.pop();
    const joined = `/${parts.join("/")}`;
    return joined === "" ? "/" : joined;
  }

  function setNode(path, node) {
    const parent = getNode(getParentPath(path));
    const name = splitPath(path).pop();
    if (!parent || parent.type !== "folder" || !name) return;
    parent.children[name] = node;
  }

  function removeNode(path) {
    const parent = getNode(getParentPath(path));
    const name = splitPath(path).pop();
    if (parent && parent.children && name) delete parent.children[name];
  }

  function renderAll() {
    ensurePaths();
    el.languageSelect.value = state.language;
    renderSession();
    renderDeviceMode();
    renderLocalTree();
    renderEditor();
    renderFirmwarePresets();
    renderPicoTree();
  }

  function ensurePaths() {
    if (!getNode(state.selectedLocalPath)) state.selectedLocalPath = "/main.py";
    const editorNode = getNode(state.activeEditorPath);
    if (!editorNode || editorNode.type !== "file") state.activeEditorPath = "/main.py";
  }

  function renderSession() {
    el.sessionStatus.textContent = state.user ? `${state.user} 로그인됨` : "로그인이 필요합니다.";
    if (state.pico.connected && state.pico.info) {
      el.picoStatus.textContent = `USB 시리얼 연결됨 (${formatPortInfo(state.pico.info)})`;
    } else {
      el.picoStatus.textContent = "Pico 연결 안 됨";
    }
  }

  async function renderDeviceMode() {
    el.deviceTarget.value = state.deviceTarget;
    el.deviceModeLabel.textContent = state.deviceTarget === "arduino" ? "Arduino 모드" : "Pico 모드";
    el.codeModeLabel.textContent = state.deviceTarget === "arduino" ? "Arduino C++ 편집기" : "MicroPython 편집기";
    document.getElementById("connectButton").disabled = state.deviceTarget !== "pico";
    document.getElementById("disconnectButton").disabled = state.deviceTarget !== "pico";
    document.getElementById("runOnPicoButton").disabled = state.deviceTarget !== "pico";
    document.getElementById("saveToPicoButton").disabled = state.deviceTarget !== "pico";
    document.getElementById("refreshPicoButton").disabled = state.deviceTarget !== "pico";
    document.getElementById("loadFromPicoButton").disabled = state.deviceTarget !== "pico";
    document.getElementById("renamePicoButton").disabled = state.deviceTarget !== "pico";
    document.getElementById("deletePicoButton").disabled = state.deviceTarget !== "pico";
    document.getElementById("newPicoFolderButton").disabled = state.deviceTarget !== "pico";
    if (state.deviceTarget === "arduino") {
      await renderArduinoStatus();
    } else {
      el.deviceStatusBox.innerHTML = "<p class='tree-empty'>Pico 모드에서는 Web Serial과 파일 업로드를 사용합니다.</p>";
    }
  }

  function formatPortInfo(info) {
    if (!info) return "시리얼 포트";
    const vid = info.usbVendorId != null ? `VID ${info.usbVendorId.toString(16)}` : null;
    const pid = info.usbProductId != null ? `PID ${info.usbProductId.toString(16)}` : null;
    return [vid, pid].filter(Boolean).join(" / ") || "시리얼 포트";
  }

  async function refreshSerialPorts() {
    if (!navigator.serial || !el.serialPortList) {
      if (el.serialPortList) el.serialPortList.innerHTML = "<p class='tree-empty'>이 브라우저는 시리얼 API를 지원하지 않습니다.</p>";
      return;
    }
    try {
      const ports = await navigator.serial.getPorts();
      const visiblePorts = ports.slice();
      if (state.pico.connected && state.pico.port && !visiblePorts.includes(state.pico.port)) {
        visiblePorts.unshift(state.pico.port);
      }
      el.serialPortList.innerHTML = "";
      if (!visiblePorts.length) {
        el.serialPortList.innerHTML = "<p class='tree-empty'>허용된 시리얼 포트가 없습니다. USB Pico 연결 버튼으로 먼저 권한을 주세요.</p>";
        return;
      }
      visiblePorts.forEach((port, index) => {
        const info = port.getInfo ? port.getInfo() : null;
        const row = document.createElement("div");
        const isCurrent = state.pico.port === port;
        row.className = `tree-item ${isCurrent ? "active" : ""}`;
        row.innerHTML = `<strong>${isCurrent ? "현재 연결됨" : `포트 ${index + 1}`}</strong><br><span>${formatPortInfo(info)}</span>`;
        el.serialPortList.appendChild(row);
      });
    } catch (error) {
      el.serialPortList.innerHTML = `<p class='tree-empty'>포트 목록을 읽지 못했습니다: ${error.message}</p>`;
    }
  }

  function renderLocalTree() {
    const root = getNode("/");
    const selectedNode = getNode(state.selectedLocalPath);
    el.activeFolderLabel.textContent = selectedNode && selectedNode.type === "folder" ? state.selectedLocalPath : getParentPath(state.selectedLocalPath);
    el.localTree.innerHTML = "";
    el.localTree.appendChild(renderFolderEntries(root, "/"));
  }

  function renderFolderEntries(folderNode, currentPath) {
    const fragment = document.createDocumentFragment();
    const entries = Object.entries(folderNode.children || {}).sort((a, b) => {
      if (a[1].type !== b[1].type) return a[1].type === "folder" ? -1 : 1;
      return a[0].localeCompare(b[0]);
    });

    entries.forEach(([name, node]) => {
      const path = currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `tree-item ${state.selectedLocalPath === path ? "active" : ""}`;
      button.style.paddingLeft = `${0.7 + splitPath(path).length * 0.35}rem`;
      button.textContent = `${node.type === "folder" ? "📁" : "📄"} ${name}`;
      button.addEventListener("click", () => {
        state.selectedLocalPath = path;
        if (node.type === "folder") {
          if (state.openFolders.has(path)) state.openFolders.delete(path);
          else state.openFolders.add(path);
        } else {
          state.activeEditorPath = path;
        }
        renderAll();
      });
      fragment.appendChild(button);
      if (node.type === "folder" && state.openFolders.has(path)) fragment.appendChild(renderFolderEntries(node, path));
    });
    return fragment;
  }

  function renderEditor() {
    const active = getNode(state.activeEditorPath);
    setEditorValue(active && active.type === "file" ? active.content : DEFAULT_CODE);
    el.activeFileLabel.textContent = state.activeEditorPath;
  }

  function setEditorValue(code) {
    el.pythonEditor.value = code;
    syncCodeHighlight();
  }

  function syncCodeHighlight() {
    if (!el.codeHighlight) return;
    try {
      el.codeHighlight.innerHTML = highlightCode(el.pythonEditor.value || " ");
    } catch {
      el.codeHighlight.textContent = el.pythonEditor.value || " ";
    }
    syncCodeHighlightScroll();
  }

  function syncCodeHighlightScroll() {
    if (!el.codeHighlight) return;
    el.codeHighlight.scrollTop = el.pythonEditor.scrollTop;
    el.codeHighlight.scrollLeft = el.pythonEditor.scrollLeft;
  }

  function highlightCode(code) {
    const keywords = state.deviceTarget === "arduino"
      ? "\\b(?:void|setup|loop|if|else|for|while|do|switch|case|break|continue|return|int|long|float|double|bool|boolean|char|const|static|unsigned|String|HIGH|LOW|INPUT|OUTPUT|INPUT_PULLUP|true|false|null)\\b"
      : "\\b(?:and|as|assert|break|class|continue|def|elif|else|except|False|finally|for|from|global|if|import|in|is|lambda|None|not|or|pass|raise|return|True|try|while|with|yield)\\b";
    const builtins = "\\b(?:print|input|range|len|int|float|str|max|min|Pin|PWM|ADC|sleep_ms|sleep_us|ticks_us|ticks_diff|digitalWrite|digitalRead|analogRead|analogWrite|delay|pinMode|Serial|random)\\b";
    const tokenSource = "(\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'|`(?:\\\\.|[^`\\\\])*`|#.*|//.*|" +
      keywords + "|" + builtins + "|\\b\\d+(?:\\.\\d+)?\\b|[+\\-*/%=<>!&|]+)";
    const tokenPattern = new RegExp(tokenSource, "g");

    return code.replace(tokenPattern, (token) => {
      const escaped = escapeHtml(token);
      if (token.startsWith("#") || token.startsWith("//")) return `<span class="tok-comment">${escaped}</span>`;
      if (token.startsWith("\"") || token.startsWith("'") || token.startsWith("`")) return `<span class="tok-string">${escaped}</span>`;
      if (/^\d/.test(token)) return `<span class="tok-number">${escaped}</span>`;
      if (new RegExp(`^${keywords}$`).test(token)) return `<span class="tok-keyword">${escaped}</span>`;
      if (new RegExp(`^${builtins}$`).test(token)) return `<span class="tok-builtin">${escaped}</span>`;
      return `<span class="tok-operator">${escaped}</span>`;
    }).replace(/\n$/g, "\n ");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function currentFolderPath() {
    const selected = getNode(state.selectedLocalPath);
    return selected && selected.type === "folder" ? state.selectedLocalPath : getParentPath(state.selectedLocalPath);
  }

  function createFolder() {
    const name = prompt("새 폴더 이름");
    if (!name) return;
    const path = currentFolderPath() === "/" ? `/${name}` : `${currentFolderPath()}/${name}`;
    if (getNode(path)) return alert("같은 이름이 이미 있습니다.");
    setNode(path, { type: "folder", children: {} });
    state.openFolders.add(path);
    persistWorkspace();
    renderAll();
  }

  function createFile() {
    const name = prompt("새 파일 이름", "script.py");
    if (!name) return;
    const path = currentFolderPath() === "/" ? `/${name}` : `${currentFolderPath()}/${name}`;
    if (getNode(path)) return alert("같은 이름이 이미 있습니다.");
    setNode(path, { type: "file", content: "# new file\n" });
    state.selectedLocalPath = path;
    state.activeEditorPath = path;
    persistWorkspace();
    renderAll();
  }

  function renameLocalEntry() {
    const current = state.selectedLocalPath;
    const node = getNode(current);
    if (!node) return alert("선택된 항목이 없습니다.");
    const nextName = prompt("새 이름", splitPath(current).pop());
    if (!nextName) return;
    const nextPath = getParentPath(current) === "/" ? `/${nextName}` : `${getParentPath(current)}/${nextName}`;
    if (getNode(nextPath)) return alert("같은 이름이 이미 있습니다.");
    removeNode(current);
    setNode(nextPath, node);
    state.selectedLocalPath = nextPath;
    if (state.activeEditorPath === current) state.activeEditorPath = nextPath;
    persistWorkspace();
    renderAll();
  }

  function deleteLocalEntry() {
    const current = state.selectedLocalPath;
    if (current === "/main.py") return alert("기본 파일은 지우지 않도록 막아두었습니다.");
    if (!confirm(`${current} 을(를) 삭제할까요?`)) return;
    removeNode(current);
    if (state.activeEditorPath === current) state.activeEditorPath = "/main.py";
    state.selectedLocalPath = "/main.py";
    persistWorkspace();
    renderAll();
  }

  function generatePython() {
    if (!state.blocklyWorkspace) return;
    const generated = python.pythonGenerator.workspaceToCode(state.blocklyWorkspace).trim();
    const code = generated || DEFAULT_CODE;
    setEditorValue(code);
    const node = getNode(state.activeEditorPath);
    if (node && node.type === "file") node.content = code;
    persistWorkspace();
    showTab("code");
    log("블록에서 Python 코드를 생성했습니다.");
  }

  function updateCodePreviewFromBlocks() {
    if (!state.blocklyWorkspace) return;
    if (!el.showBlocksTab.classList.contains("active")) return;
    const generated = state.deviceTarget === "arduino"
      ? generateArduinoCode()
      : python.pythonGenerator.workspaceToCode(state.blocklyWorkspace).trim();
    if (generated) setEditorValue(generated);
  }

  function generateCodeForTarget() {
    if (!state.blocklyWorkspace) return;
    const code = state.deviceTarget === "arduino"
      ? generateArduinoCode()
      : (python.pythonGenerator.workspaceToCode(state.blocklyWorkspace).trim() || DEFAULT_CODE);
    setEditorValue(code);
    const node = getNode(state.activeEditorPath);
    if (node && node.type === "file") node.content = code;
    persistWorkspace();
    showTab("code");
    log(`${state.deviceTarget === "arduino" ? "Arduino" : "Pico"} 코드 생성 완료`);
  }

  function generateArduinoCode() {
    if (window.NeuroBlockRuntime?.generateArduinoCode && state.blocklyWorkspace) {
      return window.NeuroBlockRuntime.generateArduinoCode(state.blocklyWorkspace);
    }
    if (!state.blocklyWorkspace) return "";
    const includes = new Set(["#include <Arduino.h>"]);
    const setup = new Set(["Serial.begin(115200);"]);
    const loopStatements = [];
    state.blocklyWorkspace.getTopBlocks(true).forEach((block) => {
      loopStatements.push(arduinoBlockChain(block, includes, setup));
    });
    const loopBody = loopStatements.filter(Boolean).join("\n");
    return [
      ...includes,
      "",
      "void setup() {",
      ...Array.from(setup).map((line) => `  ${line}`),
      "}",
      "",
      "void loop() {",
      ...(loopBody ? loopBody.split("\n").map((line) => `  ${line}`) : ["  // Add blocks to generate Arduino code"]),
      "}"
    ].join("\n");
  }

  function arduinoBlockChain(block, includes, setup) {
    let code = "";
    let current = block;
    while (current) {
      code += arduinoStatement(current, includes, setup);
      current = current.getNextBlock();
    }
    return code;
  }

  function arduinoStatement(block, includes, setup) {
    switch (block.type) {
      case "controls_repeat_ext": {
        const times = arduinoValue(block.getInputTargetBlock("TIMES"), includes, setup) || "0";
        const body = arduinoBlockChain(block.getInputTargetBlock("DO"), includes, setup);
        return `for (int count = 0; count < ${times}; ++count) {\n${indent(body)}\n}\n`;
      }
      case "controls_if": {
        const cond = arduinoValue(block.getInputTargetBlock("IF0"), includes, setup) || "false";
        const body = arduinoBlockChain(block.getInputTargetBlock("DO0"), includes, setup);
        return `if (${cond}) {\n${indent(body)}\n}\n`;
      }
      case "pico_print":
        return `Serial.println(${arduinoValue(block.getInputTargetBlock("TEXT"), includes, setup) || "\"\""});\n`;
      case "pico_sleep_ms":
        return `delay(${arduinoValue(block.getInputTargetBlock("MS"), includes, setup) || "100"});\n`;
      case "pico_led_write":
        setup.add("pinMode(LED_BUILTIN, OUTPUT);");
        if (block.getFieldValue("STATE") === "ON") return "digitalWrite(LED_BUILTIN, HIGH);\n";
        if (block.getFieldValue("STATE") === "OFF") return "digitalWrite(LED_BUILTIN, LOW);\n";
        return "digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));\n";
      case "pico_pin_write_digital": {
        const pin = arduinoValue(block.getInputTargetBlock("PIN"), includes, setup) || "13";
        setup.add(`pinMode(${pin}, OUTPUT);`);
        return `digitalWrite(${pin}, ${block.getFieldValue("VALUE") === "1" ? "HIGH" : "LOW"});\n`;
      }
      case "pico_pwm_write": {
        const pin = arduinoValue(block.getInputTargetBlock("PIN"), includes, setup) || "9";
        const duty = arduinoValue(block.getInputTargetBlock("DUTY"), includes, setup) || "32768";
        setup.add(`pinMode(${pin}, OUTPUT);`);
        return `analogWrite(${pin}, (${duty}) / 257);\n`;
      }
      case "pico_rgb_write": {
        const rp = arduinoValue(block.getInputTargetBlock("R_PIN"), includes, setup) || "9";
        const gp = arduinoValue(block.getInputTargetBlock("G_PIN"), includes, setup) || "10";
        const bp = arduinoValue(block.getInputTargetBlock("B_PIN"), includes, setup) || "11";
        const rv = arduinoValue(block.getInputTargetBlock("R_VAL"), includes, setup) || "0";
        const gv = arduinoValue(block.getInputTargetBlock("G_VAL"), includes, setup) || "0";
        const bv = arduinoValue(block.getInputTargetBlock("B_VAL"), includes, setup) || "0";
        setup.add(`pinMode(${rp}, OUTPUT);`);
        setup.add(`pinMode(${gp}, OUTPUT);`);
        setup.add(`pinMode(${bp}, OUTPUT);`);
        return `analogWrite(${rp}, (${rv}) / 257);\nanalogWrite(${gp}, (${gv}) / 257);\nanalogWrite(${bp}, (${bv}) / 257);\n`;
      }
      case "pico_servo_write": {
        includes.add("#include <Servo.h>");
        const pin = arduinoValue(block.getInputTargetBlock("PIN"), includes, setup) || "9";
        const angle = arduinoValue(block.getInputTargetBlock("ANGLE"), includes, setup) || "90";
        return `static Servo servo_${pin};\nstatic bool servo_${pin}_attached = false;\nif (!servo_${pin}_attached) { servo_${pin}.attach(${pin}); servo_${pin}_attached = true; }\nservo_${pin}.write(${angle});\n`;
      }
      case "pico_buzzer_tone": {
        const pin = arduinoValue(block.getInputTargetBlock("PIN"), includes, setup) || "8";
        const freq = arduinoValue(block.getInputTargetBlock("FREQ"), includes, setup) || "440";
        const duration = arduinoValue(block.getInputTargetBlock("DURATION"), includes, setup) || "200";
        return `tone(${pin}, ${freq}, ${duration});\ndelay(${duration});\nnoTone(${pin});\n`;
      }
      default:
        return `// Unsupported block for Arduino: ${block.type}\n`;
    }
  }

  function arduinoValue(block, includes, setup) {
    if (!block) return "";
    switch (block.type) {
      case "math_number":
        return String(block.getFieldValue("NUM"));
      case "text":
        return JSON.stringify(block.getFieldValue("TEXT") || "");
      case "logic_boolean":
        return block.getFieldValue("BOOL") === "TRUE" ? "true" : "false";
      case "logic_compare": {
        const opMap = { EQ: "==", NEQ: "!=", LT: "<", LTE: "<=", GT: ">", GTE: ">=" };
        const a = arduinoValue(block.getInputTargetBlock("A"), includes, setup) || "0";
        const b = arduinoValue(block.getInputTargetBlock("B"), includes, setup) || "0";
        return `${a} ${opMap[block.getFieldValue("OP")] || "=="} ${b}`;
      }
      case "math_arithmetic": {
        const opMap = { ADD: "+", MINUS: "-", MULTIPLY: "*", DIVIDE: "/" };
        const a = arduinoValue(block.getInputTargetBlock("A"), includes, setup) || "0";
        const b = arduinoValue(block.getInputTargetBlock("B"), includes, setup) || "0";
        return `(${a} ${opMap[block.getFieldValue("OP")] || "+"} ${b})`;
      }
      case "pico_pin_read_digital": {
        const pin = arduinoValue(block.getInputTargetBlock("PIN"), includes, setup) || "2";
        setup.add(`pinMode(${pin}, INPUT_PULLUP);`);
        return `digitalRead(${pin})`;
      }
      case "pico_adc_read": {
        const pin = arduinoValue(block.getInputTargetBlock("PIN"), includes, setup) || "A0";
        return `analogRead(${pin})`;
      }
      case "pico_read_temperature":
        return "0 /* onboard temperature unsupported on generic Arduino */";
      default:
        return "0";
    }
  }

  function indent(text) {
    return (text || "").split("\n").filter(Boolean).map((line) => `  ${line}`).join("\n") || "  // no-op";
  }

  function saveActiveFile() {
    const node = getNode(state.activeEditorPath);
    if (!node || node.type !== "file") return alert("저장할 파일을 선택해주세요.");
    node.content = el.pythonEditor.value;
    persistWorkspace();
    renderEditor();
    log(`${state.activeEditorPath} 로컬 저장 완료`);
  }

  function downloadActiveFile() {
    const blob = new Blob([el.pythonEditor.value], { type: "text/x-python;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = splitPath(state.activeEditorPath).pop() || "main.py";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function firmwarePresets() {
    return JSON.parse(localStorage.getItem(FIRMWARE_KEY) || "[]");
  }

  function saveFirmwarePreset() {
    const version = el.firmwareVersionInput.value.trim();
    const url = el.firmwareUrlInput.value.trim();
    if (!version || !url) return alert("버전과 URL을 입력해주세요.");
    const next = firmwarePresets();
    next.push({ id: Date.now(), board: el.boardSelect.value, version, url });
    localStorage.setItem(FIRMWARE_KEY, JSON.stringify(next));
    renderFirmwarePresets();
  }

  function renderFirmwarePresets() {
    const presets = firmwarePresets();
    el.firmwarePresetList.innerHTML = "";
    if (!presets.length) {
      el.firmwarePresetList.innerHTML = "<p class='tree-empty'>저장된 프리셋이 없습니다.</p>";
      return;
    }
    presets.forEach((preset) => {
      const row = document.createElement("div");
      row.className = "tree-item";
      row.innerHTML = `<strong>${preset.board}</strong><br><span>${preset.version}</span>`;
      row.addEventListener("click", () => {
        el.boardSelect.value = preset.board;
        el.firmwareVersionInput.value = preset.version;
        el.firmwareUrlInput.value = preset.url;
      });
      el.firmwarePresetList.appendChild(row);
    });
  }

  function downloadFirmware() {
    const url = el.firmwareUrlInput.value.trim();
    if (!url) return alert("UF2 URL을 입력해주세요.");
    window.open(url, "_blank", "noopener");
  }

  async function renderArduinoStatus() {
    try {
      const status = await apiGet("/api/arduino/status");
      const boards = await apiGet("/api/arduino/boards");
      const lines = [];
      lines.push(status.installed ? "arduino-cli 설치됨" : "arduino-cli 미설치");
      if (boards && boards.length) {
        lines.push(...boards.slice(0, 5).map((board) => `${board.port?.address || "포트"} / ${board.matching_boards?.[0]?.fqbn || "보드 미확정"}`));
      } else {
        lines.push("감지된 Arduino 보드 없음");
      }
      el.deviceStatusBox.innerHTML = lines.map((line) => `<div class="tree-item">${line}</div>`).join("");
    } catch (error) {
      el.deviceStatusBox.innerHTML = `<p class='tree-empty'>Arduino 상태 확인 실패: ${error.message}</p>`;
    }
  }

  async function uploadToCurrentDevice() {
    if (state.deviceTarget === "pico") {
      await saveToPico();
      return;
    }
    try {
      const result = await apiPost("/api/arduino/upload", {
        code: el.pythonEditor.value,
        fqbn: el.arduinoFqbnInput.value.trim(),
        port: el.arduinoPortInput.value.trim(),
        sketchName: (splitPath(state.activeEditorPath).pop() || "blockly_tonny").replace(/\.[^.]+$/, "")
      });
      log(result.message || "Arduino 업로드 완료");
      await renderArduinoStatus();
    } catch (error) {
      log(`Arduino 업로드 실패: ${error.message}`);
      alert(`Arduino 업로드 실패: ${error.message}`);
    }
  }

  async function syncLibrariesForCurrentDevice() {
    try {
      if (state.deviceTarget === "pico") {
        const result = await apiPost("/api/pico/dependencies", { code: el.pythonEditor.value });
        if (!result.files?.length) {
          log("Pico에 올릴 추가 라이브러리가 없습니다.");
          return;
        }
        await ensurePicoDirectory("lib");
        for (const file of result.files) {
          await writeTextFileToPico(`lib/${file.name}`, file.content);
        }
        log(`Pico 라이브러리 ${result.files.length}개 동기화 완료`);
        await refreshPicoFiles();
      } else {
        const result = await apiPost("/api/arduino/install-libs", { code: el.pythonEditor.value });
        log(result.message || "Arduino 라이브러리 동기화 완료");
        await renderArduinoStatus();
      }
    } catch (error) {
      log(`라이브러리 동기화 실패: ${error.message}`);
    }
  }

  async function apiGet(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    } catch (error) {
      if (!isStaticHost()) throw error;
      return fallbackApiGet(url);
    }
  }

  async function apiPost(url, payload) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    } catch (error) {
      if (!isStaticHost()) throw error;
      return fallbackApiPost(url, payload);
    }
  }

  function isStaticHost() {
    return /\.github\.io$/i.test(window.location.hostname);
  }

  function fallbackApiGet(url) {
    if (url === "/api/arduino/status") {
      return { installed: false, staticHost: true };
    }
    if (url === "/api/arduino/boards") {
      return [];
    }
    throw new Error("정적 배포 환경에서는 이 기능을 사용할 수 없습니다.");
  }

  function fallbackApiPost(url, payload) {
    if (url === "/api/pico/dependencies") {
      return { files: [] };
    }
    if (url === "/api/arduino/install-libs" || url === "/api/arduino/upload") {
      return Promise.reject(new Error("GitHub Pages에서는 Arduino 업로드 기능을 사용할 수 없습니다. 로컬 서버에서 실행해 주세요."));
    }
    throw new Error("정적 배포 환경에서는 이 기능을 사용할 수 없습니다.");
  }

  function renderSession() {
    el.sessionStatus.textContent = state.user ? `${state.user} 로그인됨` : "로그인이 필요합니다.";
    el.picoStatus.textContent = state.pico.connected && state.pico.info
      ? `USB 시리얼 연결됨 (${formatPortInfo(state.pico.info)})`
      : "기기 연결 대기 중";
  }

  async function renderDeviceMode() {
    const isArduino = state.deviceTarget === "arduino";
    const connectButton = document.getElementById("connectButton");

    el.deviceTarget.value = state.deviceTarget;
    el.deviceModeLabel.textContent = isArduino ? "Arduino 모드" : "Pico 모드";
    el.codeModeLabel.textContent = isArduino ? "Arduino C++ 편집기" : "MicroPython 편집기";
    el.deviceHint.textContent = isArduino
      ? "Arduino는 보드와 포트를 선택해 업로드합니다. Web Serial은 권한/모니터에는 쓸 수 있지만 업로드 자체는 arduino-cli 방식이 더 안정적입니다."
      : "Pico는 Web Serial로 연결한 뒤 파일 읽기, 저장, 실행까지 바로 할 수 있습니다.";

    connectButton.textContent = isArduino ? "시리얼 권한 열기" : "시리얼 연결";
    connectButton.disabled = false;
    document.getElementById("disconnectButton").disabled = !state.pico.connected;
    document.getElementById("runOnPicoButton").disabled = !state.pico.connected || isArduino;
    document.getElementById("saveToPicoButton").disabled = !state.pico.connected || isArduino;
    document.getElementById("refreshPicoButton").disabled = !state.pico.connected || isArduino;
    document.getElementById("loadFromPicoButton").disabled = !state.pico.connected || isArduino;
    document.getElementById("renamePicoButton").disabled = !state.pico.connected || isArduino;
    document.getElementById("deletePicoButton").disabled = !state.pico.connected || isArduino;
    document.getElementById("newPicoFolderButton").disabled = !state.pico.connected || isArduino;

    el.arduinoBoardSearchInput.disabled = !isArduino;
    el.refreshArduinoBoardsButton.disabled = !isArduino;
    el.arduinoFqbnInput.disabled = !isArduino;
    el.arduinoPortInput.disabled = !isArduino;

    if (isArduino) {
      await renderArduinoStatus();
      renderArduinoBoardList();
      return;
    }

    el.arduinoBoardList.innerHTML = "<p class='tree-empty'>Arduino 모드에서 보드 목록이 표시됩니다.</p>";
    el.deviceStatusBox.innerHTML = "<div class='status-card'><strong>Pico 연결 안내</strong><span>시리얼 연결 후 파일을 저장하거나 실행할 수 있습니다.</span></div>";
  }

  function formatPortInfo(info) {
    if (!info) return "시리얼 포트";
    const vid = info.usbVendorId != null ? `VID ${info.usbVendorId.toString(16)}` : null;
    const pid = info.usbProductId != null ? `PID ${info.usbProductId.toString(16)}` : null;
    return [vid, pid].filter(Boolean).join(" / ") || "시리얼 포트";
  }

  async function refreshSerialPorts() {
    if (!navigator.serial || !el.serialPortList) {
      if (el.serialPortList) {
        el.serialPortList.innerHTML = "<p class='tree-empty'>이 브라우저는 Web Serial API를 지원하지 않습니다.</p>";
      }
      return;
    }

    try {
      const ports = await navigator.serial.getPorts();
      const visiblePorts = ports.slice();
      if (state.pico.connected && state.pico.port && !visiblePorts.includes(state.pico.port)) {
        visiblePorts.unshift(state.pico.port);
      }

      el.serialPortList.innerHTML = "";
      if (!visiblePorts.length) {
        el.serialPortList.innerHTML = "<p class='tree-empty'>허용된 시리얼 포트가 없습니다. 연결 버튼으로 먼저 권한을 주세요.</p>";
        return;
      }

      visiblePorts.forEach((port, index) => {
        const info = port.getInfo ? port.getInfo() : null;
        const row = document.createElement("div");
        const isCurrent = state.pico.port === port;
        row.className = `tree-item ${isCurrent ? "active" : ""}`;
        row.innerHTML = `<strong>${isCurrent ? "현재 연결됨" : `포트 ${index + 1}`}</strong><small>${formatPortInfo(info)}</small>`;
        el.serialPortList.appendChild(row);
      });
    } catch (error) {
      el.serialPortList.innerHTML = `<p class='tree-empty'>포트 목록을 읽지 못했습니다: ${error.message}</p>`;
    }
  }

  async function loadArduinoBoards(forceRefresh = false) {
    if (!forceRefresh && state.arduinoBoards.length) return state.arduinoBoards;
    state.arduinoBoards = await apiGet("/api/arduino/boards");
    return state.arduinoBoards;
  }

  function boardSummary(board) {
    const fqbn = board.matching_boards?.[0]?.fqbn || "";
    const name = board.matching_boards?.[0]?.name || fqbn || "알 수 없는 보드";
    const port = board.port?.address || "포트 미확인";
    return { name, fqbn, port };
  }

  function renderArduinoBoardList() {
    if (!el.arduinoBoardList) return;
    const keyword = (el.arduinoBoardSearchInput.value || "").trim().toLowerCase();
    const items = state.arduinoBoards.filter((board) => {
      if (!keyword) return true;
      const summary = boardSummary(board);
      return [summary.name, summary.fqbn, summary.port].some((value) => value.toLowerCase().includes(keyword));
    });

    el.arduinoBoardList.innerHTML = "";
    if (!items.length) {
      el.arduinoBoardList.innerHTML = "<p class='tree-empty'>검색 조건에 맞는 Arduino 보드가 없습니다.</p>";
      return;
    }

    items.forEach((board) => {
      const summary = boardSummary(board);
      const isActive = el.arduinoFqbnInput.value.trim() === summary.fqbn && el.arduinoPortInput.value.trim() === summary.port;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `tree-item ${isActive ? "active" : ""}`;
      button.innerHTML = `<strong>${summary.name}</strong><small>${summary.port} / ${summary.fqbn || "FQBN 없음"}</small>`;
      button.addEventListener("click", () => {
        if (summary.fqbn) el.arduinoFqbnInput.value = summary.fqbn;
        if (summary.port && summary.port !== "포트 미확인") el.arduinoPortInput.value = summary.port;
        renderArduinoBoardList();
      });
      el.arduinoBoardList.appendChild(button);
    });
  }

  async function renderArduinoStatus(forceRefresh = false) {
    try {
      const status = await apiGet("/api/arduino/status");
      const boards = await loadArduinoBoards(forceRefresh);
      const selectedFqbn = el.arduinoFqbnInput.value.trim();
      const selectedPort = el.arduinoPortInput.value.trim();
      const summary = [
        `<div class='status-card'><strong>업로드 엔진</strong><span>${status.installed ? "arduino-cli 사용 가능" : "arduino-cli가 설치되지 않아서 실제 업로드는 아직 불가"}</span></div>`,
        `<div class='status-card'><strong>감지된 보드 수</strong><span>${boards.length}개</span></div>`,
        `<div class='status-card'><strong>현재 선택</strong><span>${selectedFqbn || "보드 미선택"}${selectedPort ? ` / ${selectedPort}` : ""}</span></div>`
      ];
      el.deviceStatusBox.innerHTML = summary.join("");
      renderArduinoBoardList();
    } catch (error) {
      el.deviceStatusBox.innerHTML = `<p class='tree-empty'>Arduino 상태 확인 실패: ${error.message}</p>`;
    }
  }

  async function uploadToCurrentDevice() {
    if (state.deviceTarget === "pico") {
      await saveToPico();
      return;
    }

    try {
      const result = await apiPost("/api/arduino/upload", {
        code: el.pythonEditor.value,
        fqbn: el.arduinoFqbnInput.value.trim(),
        port: el.arduinoPortInput.value.trim(),
        sketchName: (splitPath(state.activeEditorPath).pop() || "neuro_block").replace(/\.[^.]+$/, "")
      });
      log(result.message || "Arduino 업로드 완료");
      await renderArduinoStatus(true);
    } catch (error) {
      log(`Arduino 업로드 실패: ${error.message}`);
      alert(`Arduino 업로드 실패: ${error.message}`);
    }
  }

  async function syncLibrariesForCurrentDevice() {
    try {
      if (state.deviceTarget === "pico") {
        const result = await apiPost("/api/pico/dependencies", { code: el.pythonEditor.value });
        if (!result.files?.length) {
          log("Pico에 추가로 올릴 라이브러리가 없습니다.");
          return;
        }
        await ensurePicoDirectory("lib");
        for (const file of result.files) {
          await writeTextFileToPico(`lib/${file.name}`, file.content);
        }
        log(`Pico 라이브러리 ${result.files.length}개 동기화 완료`);
        await refreshPicoFiles();
        return;
      }

      const result = await apiPost("/api/arduino/install-libs", { code: el.pythonEditor.value });
      log(result.message || "Arduino 라이브러리 동기화 완료");
      await renderArduinoStatus(true);
    } catch (error) {
      log(`라이브러리 동기화 실패: ${error.message}`);
    }
  }

  function log(message) {
    const stamp = new Date().toLocaleTimeString("ko-KR", { hour12: false });
    el.consoleOutput.textContent += `[${stamp}] ${message}\n`;
    el.consoleOutput.scrollTop = el.consoleOutput.scrollHeight;
  }

  async function connectPico() {
    if (!navigator.serial) return alert("Web Serial API를 지원하는 Chromium 브라우저가 필요합니다.");
    try {
      state.pico.port = await navigator.serial.requestPort({ filters: PICO_USB_FILTERS });
      state.pico.info = state.pico.port.getInfo ? state.pico.port.getInfo() : null;
      await state.pico.port.open({ baudRate: 115200 });

      const encoder = new TextEncoderStream();
      encoder.readable.pipeTo(state.pico.port.writable);
      state.pico.writer = encoder.writable.getWriter();

      const decoder = new TextDecoderStream();
      state.pico.port.readable.pipeTo(decoder.writable);
      state.pico.reader = decoder.readable.getReader();

      state.pico.connected = true;
      renderSession();
      await refreshSerialPorts();
      await sleep(600);
      await interruptPico();
      await refreshPicoFiles();
      log(`USB Pico 연결 완료: ${formatPortInfo(state.pico.info)}`);
    } catch (error) {
      log(`Pico 연결 실패: ${error.message}`);
      alert(`Pico 연결 실패: ${error.message}`);
    }
  }

  async function disconnectPico() {
    try {
      if (state.pico.reader) {
        await state.pico.reader.cancel();
        state.pico.reader.releaseLock();
      }
      if (state.pico.writer) {
        await state.pico.writer.close();
        state.pico.writer.releaseLock();
      }
      if (state.pico.port) await state.pico.port.close();
    } catch (error) {
      log(`연결 해제 중 경고: ${error.message}`);
    } finally {
      state.pico = { port: null, reader: null, writer: null, connected: false, info: null };
      state.picoEntries = [];
      renderAll();
      await refreshSerialPorts();
    }
  }

  async function interruptPico() {
    if (!state.pico.connected) return;
    await state.pico.writer.write("\x03\x03");
    await sleep(200);
  }

  async function enterRawRepl() {
    await state.pico.writer.write("\x03\x03");
    await sleep(80);
    await state.pico.writer.write("\x01");
    await sleep(80);
    await readUntil("raw REPL");
  }

  async function exitRawRepl() {
    await state.pico.writer.write("\x02");
    await sleep(80);
  }

  async function readUntil(marker, timeoutMs = 3500) {
    const start = Date.now();
    let output = "";
    while (Date.now() - start < timeoutMs) {
      const { value, done } = await state.pico.reader.read();
      if (done) break;
      output += value;
      if (output.includes(marker)) return output;
    }
    return output;
  }

  async function rawExec(code) {
    if (!state.pico.connected) throw new Error("Pico가 연결되어 있지 않습니다.");
    await enterRawRepl();
    await state.pico.writer.write(code.replace(/\r?\n/g, "\r\n"));
    await state.pico.writer.write("\x04");
    const output = await readUntil("\x04>", 5000);
    await exitRawRepl();
    return output;
  }

  function pyString(text) {
    return JSON.stringify(text).replace(/\u2028|\u2029/g, "");
  }

  async function refreshPicoFiles() {
    if (!state.pico.connected) return alert("먼저 Pico를 연결해주세요.");
    try {
      const code = [
        "import os",
        "def walk(base):",
        "    rows = []",
        "    for name in os.listdir(base):",
        "        path = name if base == '.' else base + '/' + name",
        "        try:",
        "            mode = os.stat(path)[0]",
        "            is_dir = bool(mode & 0x4000)",
        "        except Exception:",
        "            is_dir = False",
        "        rows.append(('dir' if is_dir else 'file') + ':' + path)",
        "        if is_dir:",
        "            rows.extend(walk(path))",
        "    return rows",
        "for row in walk('.'):",
        "    print(row)"
      ].join("\n");
      const output = await rawExec(code);
      state.picoEntries = output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith("file:") || line.startsWith("dir:")).map((line) => {
        const [kind, ...rest] = line.split(":");
        return { kind, path: rest.join(":") };
      });
      renderPicoTree();
      log("Pico 파일 목록 새로고침 완료");
    } catch (error) {
      log(`Pico 파일 목록 실패: ${error.message}`);
    }
  }

  function renderPicoTree() {
    el.picoTree.innerHTML = "";
    if (!state.picoEntries.length) {
      el.picoTree.innerHTML = "<p class='tree-empty'>표시할 Pico 파일이 없습니다.</p>";
      return;
    }
    state.picoEntries.slice().sort((a, b) => a.path.localeCompare(b.path)).forEach((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `tree-item ${state.selectedPicoPath === entry.path ? "active" : ""}`;
      button.textContent = `${entry.kind === "dir" ? "📁" : "📄"} ${entry.path}`;
      button.addEventListener("click", () => {
        state.selectedPicoPath = entry.path;
        renderPicoTree();
      });
      el.picoTree.appendChild(button);
    });
  }

  async function runOnPico() {
    if (!state.pico.connected) return alert("먼저 Pico를 연결해주세요.");
    try {
      const output = await rawExec(el.pythonEditor.value);
      log(cleanPicoOutput(output) || "실행 완료");
    } catch (error) {
      log(`실행 실패: ${error.message}`);
    }
  }

  async function saveToPico() {
    if (!state.pico.connected) return alert("먼저 Pico를 연결해주세요.");
    const target = prompt("Pico에 저장할 파일 경로", splitPath(state.activeEditorPath).pop() || "main.py");
    if (!target) return;
    try {
      const output = await writeTextFileToPico(target, el.pythonEditor.value);
      log(cleanPicoOutput(output) || `${target} 저장 완료`);
      await refreshPicoFiles();
    } catch (error) {
      log(`저장 실패: ${error.message}`);
    }
  }

  async function writeTextFileToPico(target, content) {
    return rawExec([`data = ${pyString(content)}`, `with open(${pyString(target)}, 'w') as f:`, "    f.write(data)", `print('saved:${target}')`].join("\n"));
  }

  async function ensurePicoDirectory(target) {
    return rawExec(["import os", `\ntry:\n    os.mkdir(${pyString(target)})\nexcept OSError:\n    pass`, `print('dir:${target}')`].join("\n"));
  }

  async function loadFromPico() {
    if (!state.pico.connected) return alert("먼저 Pico를 연결해주세요.");
    const target = state.selectedPicoPath || prompt("불러올 Pico 파일", "main.py");
    if (!target) return;
    try {
      const output = await rawExec([`with open(${pyString(target)}, 'r') as f:`, "    print(f.read())"].join("\n"));
      setEditorValue(cleanPicoOutput(output));
      const node = getNode(state.activeEditorPath);
      if (node && node.type === "file") node.content = el.pythonEditor.value;
      log(`${target} 불러오기 완료`);
      showTab("code");
    } catch (error) {
      log(`불러오기 실패: ${error.message}`);
    }
  }

  async function createPicoFolder() {
    if (!state.pico.connected) return alert("먼저 Pico를 연결해주세요.");
    const target = prompt("생성할 Pico 폴더", "lib");
    if (!target) return;
    try {
      const output = await rawExec(["import os", `os.mkdir(${pyString(target)})`, `print('mkdir:${target}')`].join("\n"));
      log(cleanPicoOutput(output) || `${target} 생성 완료`);
      await refreshPicoFiles();
    } catch (error) {
      log(`폴더 생성 실패: ${error.message}`);
    }
  }

  async function renamePicoEntry() {
    if (!state.pico.connected) return alert("먼저 Pico를 연결해주세요.");
    const source = state.selectedPicoPath || prompt("변경할 Pico 경로", "main.py");
    if (!source) return;
    const target = prompt("새 경로 또는 파일명", source);
    if (!target || target === source) return;
    try {
      const output = await rawExec(["import os", `os.rename(${pyString(source)}, ${pyString(target)})`, `print('renamed:${source}->${target}')`].join("\n"));
      log(cleanPicoOutput(output) || "이름 변경 완료");
      await refreshPicoFiles();
    } catch (error) {
      log(`이름 변경 실패: ${error.message}`);
    }
  }

  async function deletePicoEntry() {
    if (!state.pico.connected) return alert("먼저 Pico를 연결해주세요.");
    const target = state.selectedPicoPath || prompt("삭제할 Pico 경로", "main.py");
    if (!target) return;
    if (!confirm(`${target} 을(를) Pico에서 삭제할까요?`)) return;
    try {
      const output = await rawExec(["import os", `os.remove(${pyString(target)})`, `print('deleted:${target}')`].join("\n"));
      log(cleanPicoOutput(output) || "삭제 완료");
      await refreshPicoFiles();
    } catch (error) {
      log(`삭제 실패: ${error.message}`);
    }
  }

  function cleanPicoOutput(output) {
    return output.replace(/\x04>/g, "").replace(/^.*?raw REPL; CTRL-B to exit\r?\n?/, "").trim();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function connectPico() {
    if (!navigator.serial) {
      alert("이 브라우저는 Web Serial API를 지원하지 않습니다.");
      return;
    }

    if (state.deviceTarget === "arduino") {
      try {
        const port = await navigator.serial.requestPort();
        const info = port.getInfo ? port.getInfo() : null;
        log(`Arduino용 시리얼 권한을 열었습니다. ${formatPortInfo(info)}`);
        await refreshSerialPorts();
        await renderArduinoStatus(true);
      } catch (error) {
        log(`Arduino 시리얼 권한 요청 실패: ${error.message}`);
      }
      return;
    }

    try {
      state.pico.port = await navigator.serial.requestPort({ filters: PICO_USB_FILTERS });
      state.pico.info = state.pico.port.getInfo ? state.pico.port.getInfo() : null;
      await state.pico.port.open({ baudRate: 115200 });

      const encoder = new TextEncoderStream();
      encoder.readable.pipeTo(state.pico.port.writable);
      state.pico.writer = encoder.writable.getWriter();

      const decoder = new TextDecoderStream();
      state.pico.port.readable.pipeTo(decoder.writable);
      state.pico.reader = decoder.readable.getReader();

      state.pico.connected = true;
      renderSession();
      await refreshSerialPorts();
      await sleep(600);
      await interruptPico();
      await refreshPicoFiles();
      await renderDeviceMode();
      log(`USB Pico 연결 완료: ${formatPortInfo(state.pico.info)}`);
    } catch (error) {
      log(`Pico 연결 실패: ${error.message}`);
      alert(`Pico 연결 실패: ${error.message}`);
    }
  }
/* --- 1. 전역 선택 변수 확인 --- */
  // state.selectedPicoPath 는 이미 상단에 정의되어 있을 것이므로 따로 선언하지 않아도 됩니다.

  /* --- 2. 목록을 불러오고 UI를 그리는 통합 함수 --- */
  async function refreshPicoFiles() {
    if (!state.pico.connected) return;

    // HTML에 새로 만든 ID인 'picoTreeSide'를 직접 찾습니다.
    const container = document.getElementById('picoTreeSide');
    if (!container) return;

    try {
      container.style.opacity = '0.5';
      
      // Pico에서 파일 목록을 가져오는 파이썬 코드
      const code = [
        "import os",
        "def walk(base):",
        "    res = []",
        "    try:",
        "        for name in os.listdir(base):",
        "            path = name if base == '.' else base + '/' + name",
        "            try:",
        "                s = os.stat(path)",
        "                is_dir = bool(s[0] & 0x4000)",
        "            except: is_dir = False",
        "            res.append(('dir' if is_dir else 'file') + ':' + path)",
        "            if is_dir: res.extend(walk(path))",
        "    except: pass",
        "    return res",
        "for r in walk('.'): print(r)"
      ].join("\\n");

      const rawOutput = await rawExec(code);
      const cleanOutput = cleanPicoOutput(rawOutput);

      // 데이터 파싱
      state.picoEntries = cleanOutput.split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.startsWith("file:") || line.startsWith("dir:"))
        .map(line => {
          const [kind, ...rest] = line.split(":");
          return { kind, path: rest.join(":") };
        });

      // UI 렌더링 호출
      renderPicoTreeSide();
      log("Pico 파일 목록 동기화 완료");
    } catch (error) {
      log(`목록 갱신 실패: ${error.message}`);
    } finally {
      container.style.opacity = '1';
    }
  }

  /* --- 3. 왼쪽 패널 전용 렌더링 함수 --- */
  function renderPicoTreeSide() {
    const container = document.getElementById('picoTreeSide');
    if (!container) return;
    container.innerHTML = "";

    if (state.picoEntries.length === 0) {
      container.innerHTML = "<p style='padding:10px; font-size:12px; color:#888;'>파일이 없습니다.</p>";
      return;
    }

    state.picoEntries.forEach(entry => {
      const item = document.createElement("div");
      item.className = `tree-item ${state.selectedPicoPath === entry.path ? "selected" : ""}`;
      item.style.cursor = "pointer";
      item.style.padding = "4px 8px";
      item.style.fontSize = "13px";
      
      // 아이콘과 경로 표시
      item.innerHTML = `<span>${entry.kind === 'dir' ? '📁' : '📄'}</span> ${entry.path}`;
      
      // 클릭 시 선택 상태 변경
      item.onclick = () => {
        state.selectedPicoPath = entry.path;
        renderPicoTreeSide(); // 다시 그려서 하이라이트 적용
      };

      container.appendChild(item);
    });
  }

  /* --- 4. 이름 변경 및 삭제 버튼 기능 연결 --- */
  
  // 삭제 버튼
  const delBtn = document.getElementById('deletePicoSide');
  if(delBtn) delBtn.onclick = async () => {
    if (!state.selectedPicoPath) return alert("삭제할 파일을 선택하세요.");
    if (!confirm(`${state.selectedPicoPath} 파일을 삭제하시겠습니까?`)) return;

    try {
      await rawExec(`import os; os.remove('${state.selectedPicoPath}')`);
      state.selectedPicoPath = null;
      await refreshPicoFiles(); // 자동 새로고침
    } catch (e) {
      log(`삭제 오류: ${e.message}`);
    }
  };

  // 이름 변경 버튼
  const renBtn = document.getElementById('renamePicoSide');
  if(renBtn) renBtn.onclick = async () => {
    if (!state.selectedPicoPath) return alert("이름을 바꿀 파일을 선택하세요.");
    const newName = prompt("새 이름을 입력하세요:", state.selectedPicoPath);
    if (newName && newName !== state.selectedPicoPath) {
      try {
        await rawExec(`import os; os.rename('${state.selectedPicoPath}', '${newName}')`);
        state.selectedPicoPath = null;
        await refreshPicoFiles(); // 자동 새로고침
      } catch (e) {
        log(`변경 오류: ${e.message}`);
      }
    }
  };
})(); // 전체 종료

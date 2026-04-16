(function () {
  function register(Blockly, pythonGenerator) {
    Blockly.defineBlocksWithJsonArray([
      { type: "pico_print", message0: "print %1", args0: [{ type: "input_value", name: "TEXT" }], previousStatement: null, nextStatement: null, colour: 20 },
      { type: "pico_sleep_ms", message0: "%1 ms wait", args0: [{ type: "input_value", name: "MS", check: "Number" }], previousStatement: null, nextStatement: null, colour: 20 },
      { type: "pico_led_write", message0: "builtin LED %1", args0: [{ type: "field_dropdown", name: "STATE", options: [["on", "ON"], ["off", "OFF"], ["toggle", "TOGGLE"]] }], previousStatement: null, nextStatement: null, colour: 0 },
      { type: "pico_relay_write", message0: "relay pin %1 %2", args0: [{ type: "input_value", name: "PIN", check: "Number" }, { type: "field_dropdown", name: "VALUE", options: [["on", "1"], ["off", "0"]] }], previousStatement: null, nextStatement: null, colour: 0 },
      { type: "pico_pin_write_digital", message0: "digital write pin %1 value %2", args0: [{ type: "input_value", name: "PIN", check: "Number" }, { type: "field_dropdown", name: "VALUE", options: [["HIGH", "1"], ["LOW", "0"]] }], previousStatement: null, nextStatement: null, colour: 330 },
      { type: "pico_pin_read_digital", message0: "digital read pin %1", args0: [{ type: "input_value", name: "PIN", check: "Number" }], output: "Number", colour: 330 },
      { type: "pico_button_read", message0: "button read pin %1", args0: [{ type: "input_value", name: "PIN", check: "Number" }], output: "Number", colour: 330 },
      { type: "pico_pwm_write", message0: "PWM pin %1 freq %2 duty %3", args0: [{ type: "input_value", name: "PIN", check: "Number" }, { type: "input_value", name: "FREQ", check: "Number" }, { type: "input_value", name: "DUTY", check: "Number" }], previousStatement: null, nextStatement: null, colour: 200 },
      { type: "pico_rgb_write", message0: "RGB pins R %1 G %2 B %3 values %4 %5 %6", args0: [{ type: "input_value", name: "R_PIN", check: "Number" }, { type: "input_value", name: "G_PIN", check: "Number" }, { type: "input_value", name: "B_PIN", check: "Number" }, { type: "input_value", name: "R_VAL", check: "Number" }, { type: "input_value", name: "G_VAL", check: "Number" }, { type: "input_value", name: "B_VAL", check: "Number" }], previousStatement: null, nextStatement: null, colour: 130 },
      { type: "pico_neopixel_write", message0: "NeoPixel pin %1 count %2 index %3 color %4 %5 %6", args0: [{ type: "input_value", name: "PIN", check: "Number" }, { type: "input_value", name: "COUNT", check: "Number" }, { type: "input_value", name: "INDEX", check: "Number" }, { type: "input_value", name: "R", check: "Number" }, { type: "input_value", name: "G", check: "Number" }, { type: "input_value", name: "B", check: "Number" }], previousStatement: null, nextStatement: null, colour: 130 },
      { type: "pico_servo_write", message0: "servo pin %1 angle %2", args0: [{ type: "input_value", name: "PIN", check: "Number" }, { type: "input_value", name: "ANGLE", check: "Number" }], previousStatement: null, nextStatement: null, colour: 200 },
      { type: "pico_adc_read", message0: "ADC read pin %1", args0: [{ type: "input_value", name: "PIN", check: "Number" }], output: "Number", colour: 170 },
      { type: "pico_ultrasonic_read", message0: "ultrasonic trig %1 echo %2", args0: [{ type: "input_value", name: "TRIG", check: "Number" }, { type: "input_value", name: "ECHO", check: "Number" }], output: "Number", colour: 170 },
      { type: "pico_read_temperature", message0: "read onboard temperature", output: "Number", colour: 170 },
      { type: "pico_buzzer_tone", message0: "buzzer pin %1 freq %2 Hz duration %3 ms", args0: [{ type: "input_value", name: "PIN", check: "Number" }, { type: "input_value", name: "FREQ", check: "Number" }, { type: "input_value", name: "DURATION", check: "Number" }], previousStatement: null, nextStatement: null, colour: 45 },
      { type: "pico_map_value", message0: "map %1 from %2 - %3 to %4 - %5", args0: [{ type: "input_value", name: "VALUE", check: "Number" }, { type: "input_value", name: "IN_MIN", check: "Number" }, { type: "input_value", name: "IN_MAX", check: "Number" }, { type: "input_value", name: "OUT_MIN", check: "Number" }, { type: "input_value", name: "OUT_MAX", check: "Number" }], output: "Number", colour: 170 }
    ]);

    const py = pythonGenerator;
    py.forBlock.pico_print = (block, generator) => `print(${generator.valueToCode(block, "TEXT", 0) || "''"})\n`;
    py.forBlock.pico_sleep_ms = (block, generator) => {
      generator.definitions_.import_utime = "from utime import sleep_ms";
      return `sleep_ms(${generator.valueToCode(block, "MS", 0) || "100"})\n`;
    };
    py.forBlock.pico_led_write = (block, generator) => {
      ensureMachine(generator);
      generator.definitions_.builtin_led = "led = Pin('LED', Pin.OUT)";
      const mode = block.getFieldValue("STATE");
      return mode === "ON" ? "led.value(1)\n" : mode === "OFF" ? "led.value(0)\n" : "led.toggle()\n";
    };
    py.forBlock.pico_relay_write = (block, generator) => {
      ensureMachine(generator);
      const pin = generator.valueToCode(block, "PIN", 0) || "15";
      return `Pin(${pin}, Pin.OUT).value(${block.getFieldValue("VALUE")})\n`;
    };
    py.forBlock.pico_pin_write_digital = (block, generator) => {
      ensureMachine(generator);
      const pin = generator.valueToCode(block, "PIN", 0) || "15";
      return `Pin(${pin}, Pin.OUT).value(${block.getFieldValue("VALUE")})\n`;
    };
    py.forBlock.pico_pin_read_digital = (block, generator) => {
      ensureMachine(generator);
      const pin = generator.valueToCode(block, "PIN", 0) || "14";
      return [`Pin(${pin}, Pin.IN, Pin.PULL_UP).value()`, 0];
    };
    py.forBlock.pico_button_read = (block, generator) => {
      ensureMachine(generator);
      const pin = generator.valueToCode(block, "PIN", 0) || "14";
      return [`Pin(${pin}, Pin.IN, Pin.PULL_UP).value()`, 0];
    };
    py.forBlock.pico_pwm_write = (block, generator) => {
      ensureMachine(generator);
      const pin = generator.valueToCode(block, "PIN", 0) || "15";
      const freq = generator.valueToCode(block, "FREQ", 0) || "1000";
      const duty = generator.valueToCode(block, "DUTY", 0) || "32768";
      return `pwm = PWM(Pin(${pin}))\npwm.freq(${freq})\npwm.duty_u16(${duty})\n`;
    };
    py.forBlock.pico_rgb_write = (block, generator) => {
      ensureMachine(generator);
      const rp = generator.valueToCode(block, "R_PIN", 0) || "0";
      const gp = generator.valueToCode(block, "G_PIN", 0) || "1";
      const bp = generator.valueToCode(block, "B_PIN", 0) || "2";
      const rv = generator.valueToCode(block, "R_VAL", 0) || "0";
      const gv = generator.valueToCode(block, "G_VAL", 0) || "0";
      const bv = generator.valueToCode(block, "B_VAL", 0) || "0";
      return `rgb_r = PWM(Pin(${rp}))\nrgb_g = PWM(Pin(${gp}))\nrgb_b = PWM(Pin(${bp}))\nrgb_r.freq(1000)\nrgb_g.freq(1000)\nrgb_b.freq(1000)\nrgb_r.duty_u16(${rv})\nrgb_g.duty_u16(${gv})\nrgb_b.duty_u16(${bv})\n`;
    };
    py.forBlock.pico_neopixel_write = (block, generator) => {
      ensureMachine(generator);
      generator.definitions_.import_neopixel = "import neopixel";
      const pin = generator.valueToCode(block, "PIN", 0) || "16";
      const count = generator.valueToCode(block, "COUNT", 0) || "8";
      const index = generator.valueToCode(block, "INDEX", 0) || "0";
      const r = generator.valueToCode(block, "R", 0) || "255";
      const g = generator.valueToCode(block, "G", 0) || "0";
      const b = generator.valueToCode(block, "B", 0) || "0";
      return `np = neopixel.NeoPixel(Pin(${pin}), ${count})\nnp[${index}] = (${r}, ${g}, ${b})\nnp.write()\n`;
    };
    py.forBlock.pico_servo_write = (block, generator) => {
      ensureMachine(generator);
      const pin = generator.valueToCode(block, "PIN", 0) || "16";
      const angle = generator.valueToCode(block, "ANGLE", 0) || "90";
      return `servo = PWM(Pin(${pin}))\nservo.freq(50)\nservo.duty_u16(int(1802 + (${angle}) * (7864 - 1802) / 180))\n`;
    };
    py.forBlock.pico_adc_read = (block, generator) => {
      ensureMachine(generator);
      const pin = generator.valueToCode(block, "PIN", 0) || "26";
      return [`ADC(Pin(${pin})).read_u16()`, 0];
    };
    py.forBlock.pico_ultrasonic_read = (block, generator) => {
      ensureMachine(generator);
      generator.definitions_.import_utime = "from utime import sleep_ms, sleep_us, ticks_us, ticks_diff";
      generator.definitions_.ultrasonic_helper = [
        "def read_ultrasonic(trig_pin_num, echo_pin_num):",
        "    trig = Pin(trig_pin_num, Pin.OUT)",
        "    echo = Pin(echo_pin_num, Pin.IN)",
        "    trig.value(0)",
        "    sleep_us(2)",
        "    trig.value(1)",
        "    sleep_us(10)",
        "    trig.value(0)",
        "    start_wait = ticks_us()",
        "    while echo.value() == 0:",
        "        pulse_start = ticks_us()",
        "        if ticks_diff(pulse_start, start_wait) > 30000:",
        "            return 0",
        "    while echo.value() == 1:",
        "        pulse_end = ticks_us()",
        "        if ticks_diff(pulse_end, pulse_start) > 30000:",
        "            return 0",
        "    return ticks_diff(pulse_end, pulse_start) * 0.0343 / 2"
      ].join("\n");
      const trig = generator.valueToCode(block, "TRIG", 0) || "3";
      const echo = generator.valueToCode(block, "ECHO", 0) || "2";
      return [`read_ultrasonic(${trig}, ${echo})`, 0];
    };
    py.forBlock.pico_read_temperature = (_block, generator) => {
      ensureMachine(generator);
      return ["27 - (((ADC(4).read_u16() * 3.3 / 65535) - 0.706) / 0.001721)", 0];
    };
    py.forBlock.pico_buzzer_tone = (block, generator) => {
      ensureMachine(generator);
      generator.definitions_.import_utime = "from utime import sleep_ms";
      const pin = generator.valueToCode(block, "PIN", 0) || "15";
      const freq = generator.valueToCode(block, "FREQ", 0) || "440";
      const duration = generator.valueToCode(block, "DURATION", 0) || "200";
      return `buzzer = PWM(Pin(${pin}))\nbuzzer.freq(${freq})\nbuzzer.duty_u16(32768)\nsleep_ms(${duration})\nbuzzer.duty_u16(0)\nbuzzer.deinit()\n`;
    };
    py.forBlock.pico_map_value = (block, generator) => {
      const value = generator.valueToCode(block, "VALUE", 0) || "0";
      const inMin = generator.valueToCode(block, "IN_MIN", 0) || "0";
      const inMax = generator.valueToCode(block, "IN_MAX", 0) || "1023";
      const outMin = generator.valueToCode(block, "OUT_MIN", 0) || "0";
      const outMax = generator.valueToCode(block, "OUT_MAX", 0) || "255";
      return [`(${outMin} + ((${value} - ${inMin}) * (${outMax} - ${outMin}) / (${inMax} - ${inMin})))`, 0];
    };
  }

  function ensureMachine(generator) {
    generator.definitions_.import_machine = "from machine import Pin, PWM, ADC";
  }

  function generateArduinoCode(workspace) {
    const ctx = {
      includes: new Set(["#include <Arduino.h>"]),
      setup: new Set(["Serial.begin(115200);"]),
      globals: new Set()
    };

    const loopStatements = workspace.getTopBlocks(true).map((block) => emitStatement(block, ctx)).filter(Boolean);
    return [
      ...ctx.includes,
      "",
      ...Array.from(ctx.globals),
      "void setup() {",
      ...Array.from(ctx.setup).map((line) => `  ${line}`),
      "}",
      "",
      "void loop() {",
      indent(loopStatements.join("\n") || "// no-op"),
      "}"
    ].join("\n");
  }

  function emitStatement(block, ctx) {
    if (!block) return "";
    let code = "";

    switch (block.type) {
      case "controls_repeat_ext": {
        const times = emitValue(block.getInputTargetBlock("TIMES"), ctx) || "0";
        const body = emitStatement(block.getInputTargetBlock("DO"), ctx) || "";
        code = `for (int count = 0; count < ${times}; ++count) {\n${indent(body || "// no-op")}\n}\n`;
        break;
      }
      case "controls_whileUntil": {
        const mode = block.getFieldValue("MODE");
        const cond = emitValue(block.getInputTargetBlock("BOOL"), ctx) || "false";
        const body = emitStatement(block.getInputTargetBlock("DO"), ctx) || "";
        code = `${mode === "UNTIL" ? "while (!(" + cond + "))" : "while (" + cond + ")"} {\n${indent(body || "// no-op")}\n}\n`;
        break;
      }
      case "controls_if": {
        const cond = emitValue(block.getInputTargetBlock("IF0"), ctx) || "false";
        const body = emitStatement(block.getInputTargetBlock("DO0"), ctx) || "";
        code = `if (${cond}) {\n${indent(body || "// no-op")}\n}\n`;
        break;
      }
      case "variables_set": {
        const name = block.getField("VAR")?.getText() || "item";
        const value = emitValue(block.getInputTargetBlock("VALUE"), ctx) || "0";
        ctx.globals.add(`long ${name} = 0;`);
        code = `${name} = ${value};\n`;
        break;
      }
      case "pico_print":
        code = `Serial.println(${emitValue(block.getInputTargetBlock("TEXT"), ctx) || "\"\""});\n`;
        break;
      case "pico_sleep_ms":
        code = `delay(${emitValue(block.getInputTargetBlock("MS"), ctx) || "100"});\n`;
        break;
      case "pico_led_write":
        ctx.setup.add("pinMode(LED_BUILTIN, OUTPUT);");
        code = block.getFieldValue("STATE") === "ON"
          ? "digitalWrite(LED_BUILTIN, HIGH);\n"
          : block.getFieldValue("STATE") === "OFF"
            ? "digitalWrite(LED_BUILTIN, LOW);\n"
            : "digitalWrite(LED_BUILTIN, !digitalRead(LED_BUILTIN));\n";
        break;
      case "pico_relay_write":
      case "pico_pin_write_digital": {
        const pin = emitValue(block.getInputTargetBlock("PIN"), ctx) || "13";
        ctx.setup.add(`pinMode(${pin}, OUTPUT);`);
        code = `digitalWrite(${pin}, ${block.getFieldValue("VALUE") === "1" ? "HIGH" : "LOW"});\n`;
        break;
      }
      case "pico_pwm_write": {
        const pin = emitValue(block.getInputTargetBlock("PIN"), ctx) || "9";
        const duty = emitValue(block.getInputTargetBlock("DUTY"), ctx) || "32768";
        ctx.setup.add(`pinMode(${pin}, OUTPUT);`);
        code = `analogWrite(${pin}, (${duty}) / 257);\n`;
        break;
      }
      case "pico_rgb_write": {
        const rp = emitValue(block.getInputTargetBlock("R_PIN"), ctx) || "9";
        const gp = emitValue(block.getInputTargetBlock("G_PIN"), ctx) || "10";
        const bp = emitValue(block.getInputTargetBlock("B_PIN"), ctx) || "11";
        const rv = emitValue(block.getInputTargetBlock("R_VAL"), ctx) || "0";
        const gv = emitValue(block.getInputTargetBlock("G_VAL"), ctx) || "0";
        const bv = emitValue(block.getInputTargetBlock("B_VAL"), ctx) || "0";
        ctx.setup.add(`pinMode(${rp}, OUTPUT);`);
        ctx.setup.add(`pinMode(${gp}, OUTPUT);`);
        ctx.setup.add(`pinMode(${bp}, OUTPUT);`);
        code = `analogWrite(${rp}, (${rv}) / 257);\nanalogWrite(${gp}, (${gv}) / 257);\nanalogWrite(${bp}, (${bv}) / 257);\n`;
        break;
      }
      case "pico_neopixel_write": {
        ctx.includes.add("#include <Adafruit_NeoPixel.h>");
        const pin = emitValue(block.getInputTargetBlock("PIN"), ctx) || "6";
        const count = emitValue(block.getInputTargetBlock("COUNT"), ctx) || "8";
        const index = emitValue(block.getInputTargetBlock("INDEX"), ctx) || "0";
        const r = emitValue(block.getInputTargetBlock("R"), ctx) || "255";
        const g = emitValue(block.getInputTargetBlock("G"), ctx) || "0";
        const b = emitValue(block.getInputTargetBlock("B"), ctx) || "0";
        const objectName = `pixels_${sanitize(pin)}`;
        ctx.globals.add(`Adafruit_NeoPixel ${objectName}(${count}, ${pin}, NEO_GRB + NEO_KHZ800);`);
        ctx.setup.add(`${objectName}.begin();`);
        code = `${objectName}.setPixelColor(${index}, ${objectName}.Color(${r}, ${g}, ${b}));\n${objectName}.show();\n`;
        break;
      }
      case "pico_servo_write": {
        ctx.includes.add("#include <Servo.h>");
        const pin = emitValue(block.getInputTargetBlock("PIN"), ctx) || "9";
        const angle = emitValue(block.getInputTargetBlock("ANGLE"), ctx) || "90";
        const objectName = `servo_${sanitize(pin)}`;
        ctx.globals.add(`Servo ${objectName};`);
        ctx.setup.add(`${objectName}.attach(${pin});`);
        code = `${objectName}.write(${angle});\n`;
        break;
      }
      case "pico_buzzer_tone": {
        const pin = emitValue(block.getInputTargetBlock("PIN"), ctx) || "8";
        const freq = emitValue(block.getInputTargetBlock("FREQ"), ctx) || "440";
        const duration = emitValue(block.getInputTargetBlock("DURATION"), ctx) || "200";
        code = `tone(${pin}, ${freq}, ${duration});\ndelay(${duration});\nnoTone(${pin});\n`;
        break;
      }
      default:
        break;
    }

    const next = emitStatement(block.getNextBlock(), ctx);
    return code + next;
  }

  function emitValue(block, ctx) {
    if (!block) return "";
    switch (block.type) {
      case "math_number":
        return String(block.getFieldValue("NUM"));
      case "text":
        return JSON.stringify(block.getFieldValue("TEXT") || "");
      case "logic_boolean":
        return block.getFieldValue("BOOL") === "TRUE" ? "true" : "false";
      case "logic_negate":
        return `!(${emitValue(block.getInputTargetBlock("BOOL"), ctx) || "false"})`;
      case "logic_compare": {
        const ops = { EQ: "==", NEQ: "!=", LT: "<", LTE: "<=", GT: ">", GTE: ">=" };
        return `${emitValue(block.getInputTargetBlock("A"), ctx) || "0"} ${ops[block.getFieldValue("OP")] || "=="} ${emitValue(block.getInputTargetBlock("B"), ctx) || "0"}`;
      }
      case "math_arithmetic": {
        const ops = { ADD: "+", MINUS: "-", MULTIPLY: "*", DIVIDE: "/" };
        return `(${emitValue(block.getInputTargetBlock("A"), ctx) || "0"} ${ops[block.getFieldValue("OP")] || "+"} ${emitValue(block.getInputTargetBlock("B"), ctx) || "0"})`;
      }
      case "text_join":
        return emitTextJoin(block, ctx);
      case "variables_get":
        return block.getField("VAR")?.getText() || "item";
      case "pico_pin_read_digital":
      case "pico_button_read": {
        const pin = emitValue(block.getInputTargetBlock("PIN"), ctx) || "2";
        ctx.setup.add(`pinMode(${pin}, INPUT_PULLUP);`);
        return `digitalRead(${pin})`;
      }
      case "pico_adc_read":
        return `analogRead(${emitValue(block.getInputTargetBlock("PIN"), ctx) || "A0"})`;
      case "pico_ultrasonic_read": {
        const trig = emitValue(block.getInputTargetBlock("TRIG"), ctx) || "3";
        const echo = emitValue(block.getInputTargetBlock("ECHO"), ctx) || "2";
        ctx.globals.add([
          `float readUltrasonic_${sanitize(trig)}_${sanitize(echo)}() {`,
          `  pinMode(${trig}, OUTPUT);`,
          `  pinMode(${echo}, INPUT);`,
          `  digitalWrite(${trig}, LOW);`,
          "  delayMicroseconds(2);",
          `  digitalWrite(${trig}, HIGH);`,
          "  delayMicroseconds(10);",
          `  digitalWrite(${trig}, LOW);`,
          `  unsigned long duration = pulseIn(${echo}, HIGH, 30000);`,
          "  return duration * 0.0343f / 2.0f;",
          "}"
        ].join("\n"));
        return `readUltrasonic_${sanitize(trig)}_${sanitize(echo)}()`;
      }
      case "pico_read_temperature":
        return "0";
      case "pico_map_value":
        return `map(${emitValue(block.getInputTargetBlock("VALUE"), ctx) || "0"}, ${emitValue(block.getInputTargetBlock("IN_MIN"), ctx) || "0"}, ${emitValue(block.getInputTargetBlock("IN_MAX"), ctx) || "1023"}, ${emitValue(block.getInputTargetBlock("OUT_MIN"), ctx) || "0"}, ${emitValue(block.getInputTargetBlock("OUT_MAX"), ctx) || "255"})`;
      default:
        return "0";
    }
  }

  function emitTextJoin(block, ctx) {
    const pieces = [];
    for (let i = 0; block.getInput("ADD" + i); i += 1) {
      pieces.push(`String(${emitValue(block.getInputTargetBlock("ADD" + i), ctx) || "\"\""})`);
    }
    return pieces.length ? pieces.join(" + ") : "\"\"";
  }

  function indent(text) {
    return (text || "").split("\n").filter(Boolean).map((line) => `  ${line}`).join("\n");
  }

  function sanitize(value) {
    return String(value).replace(/[^a-zA-Z0-9_]/g, "_");
  }

  window.NeuroBlockRuntime = { register, generateArduinoCode };
})();

const fields = [
  "scene",
  "cut",
  "duration",
  "location",
  "timeOfDay",
  "frame",
  "shotSize",
  "angle",
  "camera",
  "visual",
  "dialogue",
  "caption",
  "sound",
  "transition",
  "castProps",
  "lighting",
  "memo"
];
const legacyFields = ["scene", "cut", "duration", "location", "timeOfDay", "visual", "dialogue", "caption", "sound", "transition", "memo"];

const sampleScript = `S#1. 작업실 / 밤
노트북 화면에 마지막 대본 파일이 열려 있다.
작가: 이걸 바로 글콘티로 바꿀 수 있으면 좋겠는데.
키보드 소리가 조용히 이어진다.

S#2. 카페 / 낮
두 사람이 창가 테이블에 마주 앉아 수정 방향을 이야기한다.
연출: 화면 설명은 짧고, 대사는 원문을 살려 주세요.
자막: 1차 검토본

S#3. 골목 / 저녁
주인공이 천천히 걸음을 멈추고 뒤를 돌아본다.
바람 소리와 낮은 음악이 깔린다.`;

const sourceText = document.querySelector("#sourceText");
const splitMode = document.querySelector("#splitMode");
const defaultDuration = document.querySelector("#defaultDuration");
const tbody = document.querySelector("#storyboardBody");
const template = document.querySelector("#rowTemplate");
const fileStatus = document.querySelector("#fileStatus");
const analysisSummary = document.querySelector("#analysisSummary");
const readableExtensions = new Set([
  "txt",
  "text",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "html",
  "htm",
  "srt",
  "vtt",
  "rtf"
]);
const browserParsedExtensions = new Set(["doc", "docx", "pdf", "hwp", "hwpx", "odt"]);

document.querySelector("#createdDate").valueAsDate = new Date();
document.querySelector("#sampleBtn").addEventListener("click", () => {
  sourceText.value = sampleScript;
  buildRows(parseScript(sampleScript));
});
document.querySelector("#parseBtn").addEventListener("click", () => buildRows(parseScript(sourceText.value)));
document.querySelector("#addRowBtn").addEventListener("click", () => appendRow(emptyRow(tbody.children.length + 1)));
document.querySelector("#duplicateRowBtn").addEventListener("click", duplicateSelectedRows);
document.querySelector("#deleteRowBtn").addEventListener("click", deleteSelectedRows);
document.querySelector("#renumberBtn").addEventListener("click", renumberRows);
document.querySelector("#exportBtn").addEventListener("click", exportHtml);
document.querySelector("#saveProjectBtn").addEventListener("click", saveProjectFile);
document.querySelector("#fileInput").addEventListener("change", loadTextFile);
document.querySelector("#projectFileInput").addEventListener("change", loadProjectFile);

buildRows([emptyRow(1)]);
updateAnalysisSummary(getRows(), "");

function emptyRow(index) {
  return {
    scene: String(index).padStart(2, "0"),
    cut: "1",
    duration: `${defaultDuration.value || 10}초`,
    location: "",
    timeOfDay: "",
    frame: "",
    shotSize: "",
    angle: "",
    camera: "",
    visual: "",
    dialogue: "",
    caption: "",
    sound: "",
    transition: "",
    castProps: "",
    lighting: "",
    memo: ""
  };
}

function parseScript(text) {
  const normalized = normalizeScriptText(text);
  if (!normalized) {
    return [emptyRow(1)];
  }

  const chunks = splitIntoScenes(normalized);
  const rows = chunks.flatMap((chunk, index) => sceneToRows(chunk, index + 1));
  return rows.length ? balanceRuntime(rows, normalized) : [emptyRow(1)];
}

function splitIntoScenes(text) {
  if (splitMode.value === "paragraph") {
    return text.split(/\n\s*\n+/).map((part) => part.trim()).filter(Boolean);
  }

  const lines = text.split("\n");
  const chunks = [];
  let current = [];
  lines.forEach((line) => {
    const isHeading = isSceneHeading(line);
    if (isHeading && current.length) {
      chunks.push(current.join("\n").trim());
      current = [];
    }
    current.push(line);
  });

  if (current.length) {
    chunks.push(current.join("\n").trim());
  }

  if (splitMode.value === "heading" || chunks.length > 1) {
    return chunks.filter(Boolean);
  }

  return text.split(/\n\s*\n+/).map((part) => part.trim()).filter(Boolean);
}

function sceneToRows(chunk, index) {
  const lines = chunk.split("\n").map((line) => line.trim()).filter(Boolean);
  const firstLine = lines[0] || "";
  const hasHeading = isSceneHeading(firstLine);
  const heading = hasHeading ? firstLine : "";
  const body = hasHeading ? lines.slice(1) : lines;
  const headingParts = hasHeading ? parseHeading(heading) : { scene: "", location: "", timeOfDay: "" };
  const sceneNo = headingParts.scene || String(index).padStart(2, "0");
  const events = body.length ? body.flatMap(lineToEvents).filter(Boolean) : [classifyLine(heading || firstLine)];
  const groups = groupEventsIntoCuts(events);

  return groups.map((group, cutIndex) => {
    const row = emptyRow(index);
    const actionLines = group.filter((item) => item.type === "action").map((item) => item.text);
    const dialogueLines = group.filter((item) => item.type === "dialogue").map((item) => item.text);
    const captionLines = group.filter((item) => item.type === "caption").map((item) => item.text);
    const soundLines = group.filter((item) => item.type === "sound").map((item) => item.text);
    const transitionLines = group.filter((item) => item.type === "transition").map((item) => item.text);
    const allText = group.map((item) => item.text).join(" ");
    const characters = extractCharacters(group);
    const props = extractProps(allText);
    const shot = inferShot(actionLines.join(" "), dialogueLines.length, cutIndex, groups.length);
    const movement = inferMovement(allText);
    const angle = inferAngle(allText, shot);

    row.scene = sceneNo;
    row.cut = String(cutIndex + 1);
    row.duration = `${estimateDuration(group)}초`;
    row.location = headingParts.location || inferLocation(allText) || "";
    row.timeOfDay = headingParts.timeOfDay || inferTimeOfDay(allText);
    const lighting = inferLighting(row.timeOfDay, allText);
    row.frame = buildFramePanel(actionLines, dialogueLines, characters, row.location);
    row.shotSize = shot;
    row.angle = angle;
    row.camera = movement;
    row.visual = buildVisualText(actionLines, dialogueLines, characters, shot);
    row.dialogue = dialogueLines.join("\n");
    row.caption = captionLines.join("\n");
    row.sound = soundLines.join("\n") || inferAmbientSound(row.timeOfDay, row.location, allText);
    row.transition = transitionLines.join("\n") || inferTransition(cutIndex, groups.length, allText);
    row.castProps = buildCastProps(characters, props);
    row.lighting = lighting;
    row.memo = buildMemo({ shot, movement, angle, lighting, characters, props, source: allText });
    return row;
  });
}

function parseHeading(heading) {
  const sceneMatch = heading.match(/(?:S|SCENE|씬|장면|#)?\s*#?\s*(\d+)/i);
  const clean = heading
    .replace(/^\s*((S|SCENE|씬|장면|#)\s*#?\s*\d+|\d+)\s*[.)]?\s*/i, "")
    .replace(/^(INT|EXT|I\/E)\.\s*/i, "")
    .trim();
  const parts = clean.split(/\s*[\/|-]\s*/).filter(Boolean);
  const timeWords = ["아침", "낮", "저녁", "밤", "새벽", "실내", "실외"];
  const timeOfDay = parts.find((part) => timeWords.includes(part)) || "";
  const location = parts.filter((part) => part !== timeOfDay).join(" / ");

  return {
    scene: sceneMatch ? sceneMatch[1].padStart(2, "0") : "",
    location,
    timeOfDay
  };
}

function isSceneHeading(line) {
  const text = line.trim();
  if (!text) return false;
  if (/^\s*((S|SCENE|씬|장면|#)\s*#?\s*\d+|\d+\s*[.)]|(INT|EXT|I\/E)\.)/i.test(text)) {
    return true;
  }
  const hasDivider = /\s[\/|-]\s/.test(text);
  const hasTimeWord = /(아침|낮|저녁|밤|새벽|실내|실외)$/.test(text);
  const looksShort = text.length <= 36;
  const hasSentenceEnding = /(다|요|음|함|됨|였다|었다|한다)[.!?。！？]?$/.test(text);
  return looksShort && hasDivider && hasTimeWord && !hasSentenceEnding;
}

function normalizeScriptText(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function classifyLine(rawLine) {
  const line = rawLine.replace(/\s+/g, " ").trim();
  if (!line) return null;

  const cleanPrefix = (pattern) => line.replace(pattern, "").trim();
  if (/^(자막|그래픽|CG|SUPER|TITLE|TEXT)\s*[:：]/i.test(line)) {
    return { type: "caption", text: cleanPrefix(/^(자막|그래픽|CG|SUPER|TITLE|TEXT)\s*[:：]\s*/i) };
  }
  if (/^(음향|효과음|SFX|BGM|음악|소리)\s*[:：]/i.test(line)) {
    return { type: "sound", text: cleanPrefix(/^(음향|효과음|SFX|BGM|음악|소리)\s*[:：]\s*/i) };
  }
  if (/^(전환|컷|디졸브|페이드|WIPE|CUT TO|FADE|DISSOLVE)\s*[:：]?/i.test(line)) {
    return { type: "transition", text: cleanPrefix(/^(전환|컷|디졸브|페이드|WIPE|CUT TO|FADE|DISSOLVE)\s*[:：]?\s*/i) || line };
  }
  if (/^[가-힣A-Za-z0-9 _.-]{1,22}\s*[:：]/.test(line)) {
    return { type: "dialogue", text: line };
  }
  if (/^\([^)]+\)$/.test(line)) {
    return { type: "action", text: line.replace(/[()]/g, "") };
  }
  if (/(소리|음악|BGM|노래|울린다|들린다|효과음|침묵)/i.test(line)) {
    return { type: "sound", text: line };
  }
  return { type: "action", text: line };
}

function lineToEvents(line) {
  const classified = classifyLine(line);
  if (!classified) return [];
  if (classified.type !== "action" || classified.text.length < 90) {
    return [classified];
  }

  return splitLongActionText(classified.text).map((text) => ({ type: "action", text }));
}

function splitLongActionText(text) {
  const parts = text
    .replace(/([.!?。！？])\s+/g, "$1\n")
    .replace(/(다\.|다|요\.|요|함\.|함)\s+/g, "$1\n")
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length > 1) return parts;

  const chunks = [];
  let current = "";
  text.split(/\s+/).forEach((word) => {
    if ((current + " " + word).trim().length > 80) {
      chunks.push(current.trim());
      current = word;
    } else {
      current = `${current} ${word}`.trim();
    }
  });
  if (current) chunks.push(current.trim());
  return chunks;
}

function groupEventsIntoCuts(events) {
  const groups = [];
  let current = [];
  let dialogueCount = 0;
  let actionLength = 0;

  events.forEach((event) => {
    const hasAction = current.some((item) => item.type === "action");
    const hasDialogue = current.some((item) => item.type === "dialogue");
    const shouldBreak =
      current.length &&
      (event.type === "transition" ||
        (event.type === "dialogue" && hasAction) ||
        (event.type === "action" && hasDialogue) ||
        (event.type === "action" && actionLength > 80) ||
        (event.type === "dialogue" && dialogueCount >= 2) ||
        current.map((item) => item.text).join(" ").length > 230);

    if (shouldBreak) {
      groups.push(current);
      current = [];
      dialogueCount = 0;
      actionLength = 0;
    }

    current.push(event);
    if (event.type === "dialogue") dialogueCount += 1;
    if (event.type === "action") actionLength += event.text.length;
  });

  if (current.length) groups.push(current);
  return groups;
}

function extractCharacters(group) {
  const names = group
    .filter((item) => item.type === "dialogue")
    .map((item) => item.text.split(/[:：]/)[0].trim())
    .filter(Boolean);
  return [...new Set(names)].slice(0, 4);
}

function extractProps(text) {
  const props = ["핸드폰", "휴대폰", "전화", "노트북", "컴퓨터", "문서", "파일", "편지", "사진", "가방", "차", "컵", "책", "칼", "총", "마이크", "카메라"];
  return props.filter((prop) => text.includes(prop)).slice(0, 5);
}

function inferShot(actionText, hasDialogue, cutIndex, totalCuts) {
  if (/(얼굴|눈빛|표정|미소|눈물|손|입술)/.test(actionText)) return "클로즈업";
  if (/(둘|마주|대화|앉아|서서|함께)/.test(actionText) || hasDialogue) return "미디엄 투샷";
  if (/(전경|건물|거리|골목|방 안|카페|작업실|사무실|장소)/.test(actionText) || cutIndex === 0) return "와이드 establishing";
  if (cutIndex === totalCuts - 1) return "리액션/정리 컷";
  return "미디엄 샷";
}

function inferMovement(text) {
  if (/(다가|걸어|따라|쫓|이동|향해)/.test(text)) return "트래킹";
  if (/(돌아본|고개|시선|바라|훑)/.test(text)) return "팬/시선 이동";
  if (/(멈추|정적|침묵|가만)/.test(text)) return "고정";
  if (/(드러난|보인다|열린다|밝아)/.test(text)) return "천천히 틸트/줌";
  return "고정 또는 약한 핸드헬드";
}

function inferAngle(text, shot) {
  if (/(내려다|위에서|천장|높은 곳)/.test(text)) return "하이 앵글";
  if (/(올려다|아래에서|압도|거대)/.test(text)) return "로우 앵글";
  if (/(등 뒤|어깨 너머|마주|대화)/.test(text) || shot.includes("투샷")) return "아이레벨 / OTS 가능";
  if (/(시선|바라본|쳐다본)/.test(text)) return "POV 또는 시선 매치";
  return "아이레벨";
}

function inferLighting(timeOfDay, text) {
  if (/(어둡|그림자|침침|밤|새벽)/.test(text) || timeOfDay === "밤" || timeOfDay === "새벽") {
    return "로우키, 그림자 강조";
  }
  if (/(밝|햇빛|아침|낮|창가)/.test(text) || timeOfDay === "아침" || timeOfDay === "낮") {
    return "자연광/소프트 하이키";
  }
  if (/(긴장|불안|비밀|침묵)/.test(text)) return "대비 강한 무드 조명";
  return "장소 기본광, 인물 얼굴 확보";
}

function inferLocation(text) {
  const match = text.match(/(작업실|카페|사무실|집|방|거실|주방|학교|교실|복도|거리|골목|차 안|공원|병원|식당|회의실|스튜디오)/);
  return match ? match[1] : "";
}

function inferTimeOfDay(text) {
  const match = text.match(/(아침|낮|점심|오후|저녁|밤|새벽|실내|실외)/);
  if (!match) return "";
  return match[1] === "점심" || match[1] === "오후" ? "낮" : match[1];
}

function inferAmbientSound(timeOfDay, location, text) {
  if (/(침묵|조용)/.test(text)) return "낮은 룸톤, 짧은 정적";
  if (/(카페|식당)/.test(location)) return "실내 웅성거림, 잔잔한 BGM";
  if (/(거리|골목|공원)/.test(location)) return "외부 앰비언스, 발소리";
  if (timeOfDay === "밤" || timeOfDay === "새벽") return "낮은 룸톤, 멀리서 들리는 생활 소음";
  return "";
}

function inferTransition(cutIndex, totalCuts, text) {
  if (/(페이드|암전|어두워)/.test(text)) return "FADE";
  if (/(회상|기억|과거)/.test(text)) return "DISSOLVE";
  if (cutIndex < totalCuts - 1) return "CUT";
  return "";
}

function estimateDuration(group) {
  const dialogueChars = group
    .filter((item) => item.type === "dialogue")
    .map((item) => item.text.replace(/^[^:：]+[:：]\s*/, ""))
    .join(" ")
    .replace(/\s/g, "")
    .length;
  const actionChars = group.filter((item) => item.type === "action").map((item) => item.text).join(" ").length;
  const soundCaptionChars = group
    .filter((item) => item.type === "sound" || item.type === "caption")
    .map((item) => item.text)
    .join(" ")
    .replace(/\s/g, "")
    .length;
  const seconds =
    Math.ceil(dialogueChars / 3.4) +
    Math.ceil(actionChars / 8) +
    Math.ceil(soundCaptionChars / 7) +
    3;
  return Math.max(5, seconds || Number(defaultDuration.value) || 10);
}

function balanceRuntime(rows, source) {
  const currentTotal = sumRowDurations(rows);
  const targetTotal = estimateRuntimeFromSource(source);
  if (!targetTotal || currentTotal >= targetTotal * 0.92) {
    return rows;
  }

  const ratio = targetTotal / Math.max(currentTotal, 1);
  let balanced = rows.map((row) => {
    const current = parseInt(row.duration, 10) || Number(defaultDuration.value) || 10;
    const scaled = Math.round(current * ratio);
    return {
      ...row,
      duration: `${Math.max(6, scaled)}초`
    };
  });

  const diff = targetTotal - sumRowDurations(balanced);
  if (balanced.length && Math.abs(diff) > 0) {
    const last = balanced[balanced.length - 1];
    const lastSeconds = parseInt(last.duration, 10) || 0;
    balanced[balanced.length - 1] = {
      ...last,
      duration: `${Math.max(6, lastSeconds + diff)}초`
    };
  }
  return balanced;
}

function estimateRuntimeFromSource(source) {
  const lines = source.split("\n").map((line) => line.trim()).filter(Boolean);
  const events = lines.flatMap(lineToEvents).filter(Boolean);
  const dialogueChars = events
    .filter((item) => item.type === "dialogue")
    .map((item) => item.text.replace(/^[^:：]+[:：]\s*/, ""))
    .join("")
    .replace(/\s/g, "")
    .length;
  const actionChars = events
    .filter((item) => item.type === "action")
    .map((item) => item.text)
    .join("")
    .replace(/\s/g, "")
    .length;
  const captionSoundChars = events
    .filter((item) => item.type === "caption" || item.type === "sound")
    .map((item) => item.text)
    .join("")
    .replace(/\s/g, "")
    .length;
  const paragraphCount = source.split(/\n\s*\n+/).filter((part) => part.trim()).length;
  const sceneCount = splitIntoScenes(source).length;
  const readableChars = source.replace(/\s/g, "").length;

  const dialogueSeconds = dialogueChars / 3.2;
  const actionSeconds = actionChars / 7.2;
  const captionSoundSeconds = captionSoundChars / 6.5;
  const breathingSeconds = Math.max(paragraphCount * 6, sceneCount * 12, events.length * 1.7);
  const densitySeconds = readableChars / 6.8;

  return Math.round(Math.max(
    dialogueSeconds + actionSeconds + captionSoundSeconds + breathingSeconds,
    densitySeconds
  ));
}

function sumRowDurations(rows) {
  return rows.reduce((sum, row) => sum + (parseInt(row.duration, 10) || 0), 0);
}

function buildVisualText(actionLines, dialogueLines, characters, shot) {
  const action = actionLines.join("\n").trim();
  const characterNote = characters.length ? `${characters.join(", ")} 중심. ` : "";
  const base = action || (dialogueLines.length ? `${characterNote}대화 리액션과 시선 변화를 중심으로 구성.` : "장면 흐름에 맞춰 화면 구성.");
  return base;
}

function buildFramePanel(actionLines, dialogueLines, characters, location) {
  const subject = characters.length ? characters.join(", ") : "주요 인물/대상";
  const action = actionLines[0] || dialogueLines[0]?.replace(/^[^:：]+[:：]\s*/, "") || "핵심 행동";
  const place = location ? `${location} 배경, ` : "";
  return `${place}${subject} 중심 프레임. ${action}`;
}

function buildCastProps(characters, props) {
  const parts = [];
  if (characters.length) parts.push(`등장: ${characters.join(", ")}`);
  if (props.length) parts.push(`소품: ${props.join(", ")}`);
  return parts.join("\n");
}

function buildMemo({ shot, movement, angle, lighting, characters, props, source }) {
  const notes = [`연출 포인트: 감정/정보 전달 우선`, `프레이밍: ${shot}, ${angle}`, `촬영: ${movement}`, `조명: ${lighting}`];
  if (characters.length) notes.push(`연기: ${characters.join(", ")} 리액션 확인`);
  if (props.length) notes.push(`미술/소품: ${props.join(", ")}`);
  if (/(긴장|불안|놀라|멈칫|침묵)/.test(source)) notes.push("톤: 긴장감 유지");
  if (/(웃|미소|밝)/.test(source)) notes.push("톤: 밝고 가벼운 리듬");
  return notes.join("\n");
}

function buildRows(rows) {
  tbody.innerHTML = "";
  const normalizedRows = rows.map((row, index) => normalizeRow(row, index + 1));
  normalizedRows.forEach(appendRow);
  updateAnalysisSummary(normalizedRows, sourceText.value);
}

function normalizeRow(row, index) {
  const normalized = { ...emptyRow(index), ...row };
  enrichImportedRow(normalized);
  return normalized;
}

function appendRow(row) {
  const node = template.content.firstElementChild.cloneNode(true);
  fields.forEach((field) => {
    const control = node.querySelector(`[data-field="${field}"]`);
    control.value = row[field] || "";
  });
  node.addEventListener("input", () => updateAnalysisSummary(getRows(), sourceText.value));
  tbody.appendChild(node);
}

function getRows() {
  return [...tbody.querySelectorAll("tr")].map((tr) => {
    const row = {};
    fields.forEach((field) => {
      row[field] = tr.querySelector(`[data-field="${field}"]`).value;
    });
    return row;
  });
}

function duplicateSelectedRows() {
  const selected = [...tbody.querySelectorAll("tr")].filter((tr) => tr.querySelector(".row-check").checked);
  selected.forEach((tr) => {
    const row = {};
    fields.forEach((field) => {
      row[field] = tr.querySelector(`[data-field="${field}"]`).value;
    });
    appendRow(row);
  });
  renumberRows();
}

function deleteSelectedRows() {
  const selected = [...tbody.querySelectorAll("tr")].filter((tr) => tr.querySelector(".row-check").checked);
  selected.forEach((tr) => tr.remove());
  if (!tbody.children.length) {
    appendRow(emptyRow(1));
  }
  renumberRows();
}

function renumberRows() {
  [...tbody.querySelectorAll("tr")].forEach((tr, index) => {
    tr.querySelector('[data-field="scene"]').value = String(index + 1).padStart(2, "0");
  });
  updateAnalysisSummary(getRows(), sourceText.value);
}

function updateAnalysisSummary(rows, text) {
  if (!analysisSummary) return;
  const sceneCount = new Set(rows.map((row) => row.scene).filter(Boolean)).size;
  const dialogueCount = rows.filter((row) => row.dialogue && row.dialogue.trim()).length;
  const totalSeconds = rows.reduce((sum, row) => sum + (parseInt(row.duration, 10) || 0), 0);
  const sourceLength = text ? text.replace(/\s/g, "").length : 0;
  analysisSummary.innerHTML = "";
  [
    `장면 ${sceneCount || 0}`,
    `컷 ${rows.length}`,
    `대사 컷 ${dialogueCount}`,
    `예상 ${formatSeconds(totalSeconds)}`,
    sourceLength ? `원문 ${sourceLength.toLocaleString("ko-KR")}자` : ""
  ].filter(Boolean).forEach((item) => {
    const span = document.createElement("span");
    span.textContent = item;
    analysisSummary.appendChild(span);
  });
}

function formatSeconds(seconds) {
  if (!seconds) return "0초";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}분 ${rest}초` : `${rest}초`;
}

async function loadTextFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const extension = getExtension(file.name);

  if (!readableExtensions.has(extension) && !browserParsedExtensions.has(extension)) {
    setFileStatus(`${file.name} 형식은 아직 자동 읽기 대상이 아닙니다. 파일 내용을 텍스트로 붙여넣으면 글콘티로 변환할 수 있습니다.`, true);
    event.target.value = "";
    return;
  }

  try {
    const loadedText = await readUploadedFile(file, extension);
    if (extension === "json" && tryLoadProjectJson(loadedText)) {
      setFileStatus(`${file.name} 작업 파일을 불러왔습니다.`, false);
      return;
    }
    if ((extension === "html" || extension === "htm") && tryLoadExportedHtml(loadedText)) {
      setFileStatus(`${file.name} 내보내기 글콘티를 다시 편집 모드로 불러왔습니다.`, false);
      return;
    }
    sourceText.value = normalizeLoadedText(loadedText, extension);
    buildRows(parseScript(sourceText.value));
    setFileStatus(`${file.name} 파일을 불러와 글콘티 초안을 만들었습니다.`, false);
  } catch (error) {
    setFileStatus(`${file.name} 파일을 읽지 못했습니다. ${error.message || "다른 형식으로 변환해 다시 시도하세요."}`, true);
  } finally {
    event.target.value = "";
  }
}

async function readUploadedFile(file, extension) {
  if (extension === "doc") {
    return readLegacyDoc(file);
  }
  if (extension === "docx") {
    return readDocx(file);
  }
  if (extension === "pdf") {
    return readPdf(file);
  }
  if (extension === "hwpx") {
    return readZipXmlText(file, /Contents\/section\d+\.xml$/i);
  }
  if (extension === "hwp") {
    return readHwp(file);
  }
  if (extension === "odt") {
    return readZipXmlText(file, /content\.xml$/i);
  }
  return file.text();
}

async function readDocx(file) {
  if (!window.mammoth) {
    throw new Error("DOCX 파서가 아직 로드되지 않았습니다. 잠시 후 다시 시도하세요.");
  }
  const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value.trim();
}

async function readPdf(file) {
  const pdfjs = window.pdfjsLib || await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
  }
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }
  return pages.join("\n\n").trim();
}

async function readZipXmlText(file, pathPattern) {
  if (!window.JSZip) {
    throw new Error("압축 문서 파서가 아직 로드되지 않았습니다. 잠시 후 다시 시도하세요.");
  }
  const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  const xmlFiles = Object.values(zip.files).filter((entry) => pathPattern.test(entry.name));
  if (!xmlFiles.length) {
    throw new Error("문서 본문 XML을 찾지 못했습니다.");
  }
  const parts = [];
  for (const entry of xmlFiles) {
    parts.push(xmlToText(await entry.async("text")));
  }
  return parts.join("\n\n").trim();
}

function xmlToText(xml) {
  return new DOMParser()
    .parseFromString(xml, "application/xml")
    .documentElement
    .textContent
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function readHwp(file) {
  const cfb = await readCfb(file);
  const header = findCfbEntry(cfb, "FileHeader");
  if (!header) {
    throw new Error("HWP 파일 헤더를 찾지 못했습니다.");
  }

  const headerText = decodeAscii(header.content.slice(0, 40));
  if (!headerText.includes("HWP Document File")) {
    throw new Error("지원하는 HWP 5 문서가 아닙니다.");
  }

  const flags = readUInt32LE(header.content, 36);
  const isCompressed = (flags & 1) === 1;
  const sections = cfb.FileIndex
    .filter((entry) => /BodyText\/Section\d+$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  if (!sections.length) {
    throw new Error("HWP 본문 영역을 찾지 못했습니다.");
  }

  const parts = sections.map((entry) => {
    let bytes = entry.content;
    if (isCompressed) {
      bytes = window.pako.inflateRaw(bytes);
    }
    return extractHwpSectionText(bytes);
  });

  const text = cleanExtractedText(parts.join("\n\n"));
  if (!text) {
    throw new Error("HWP에서 추출 가능한 본문이 없습니다.");
  }
  return text;
}

function extractHwpSectionText(bytes) {
  const chunks = [];
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const header = readUInt32LE(bytes, offset);
    offset += 4;
    const tagId = header & 0x3ff;
    let size = (header >>> 20) & 0xfff;
    if (size === 0xfff) {
      if (offset + 4 > bytes.length) break;
      size = readUInt32LE(bytes, offset);
      offset += 4;
    }
    if (offset + size > bytes.length) break;
    if (tagId === 67) {
      chunks.push(decodeUtf16LE(bytes.slice(offset, offset + size)));
    }
    offset += size;
  }
  return chunks.join("\n");
}

async function readLegacyDoc(file) {
  const cfb = await readCfb(file);
  const preferred = findCfbEntry(cfb, "WordDocument");
  const streams = preferred ? [preferred] : cfb.FileIndex.filter((entry) => entry.content && entry.content.length);
  const text = cleanExtractedText(streams.map((entry) => extractBinaryDocumentText(entry.content)).join("\n"));
  if (!text) {
    throw new Error("DOC에서 추출 가능한 본문이 없습니다. 암호화 문서이거나 오래된 특수 형식일 수 있습니다.");
  }
  return text;
}

async function readCfb(file) {
  if (!window.CFB) {
    throw new Error("바이너리 문서 파서가 아직 로드되지 않았습니다. 잠시 후 다시 시도하세요.");
  }
  return window.CFB.read(await file.arrayBuffer(), { type: "array" });
}

function findCfbEntry(cfb, suffix) {
  return cfb.FileIndex.find((entry) => entry.name.replace(/^Root Entry\//, "").endsWith(suffix));
}

function extractBinaryDocumentText(bytes) {
  return [
    extractUtf16Strings(bytes),
    extractSingleByteStrings(bytes)
  ].join("\n");
}

function extractUtf16Strings(bytes) {
  const chunks = [];
  let current = [];
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    const code = bytes[index] | (bytes[index + 1] << 8);
    if (isReadableCodePoint(code)) {
      current.push(code);
    } else {
      flushCodePoints(chunks, current);
      current = [];
    }
  }
  flushCodePoints(chunks, current);
  return chunks.join("\n");
}

function extractSingleByteStrings(bytes) {
  const chunks = [];
  let current = "";
  for (const byte of bytes) {
    if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
      current += String.fromCharCode(byte);
    } else {
      if (current.trim().length >= 8) chunks.push(current.trim());
      current = "";
    }
  }
  if (current.trim().length >= 8) chunks.push(current.trim());
  return chunks.join("\n");
}

function flushCodePoints(chunks, codePoints) {
  if (codePoints.length < 2) return;
  const text = String.fromCharCode(...codePoints)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .trim();
  if (/[가-힣A-Za-z0-9]/.test(text) && text.length >= 2) {
    chunks.push(text);
  }
}

function isReadableCodePoint(code) {
  return code === 9 ||
    code === 10 ||
    code === 13 ||
    code === 32 ||
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0x3130 && code <= 0x318f) ||
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x2000 && code <= 0x206f) ||
    (code >= 0x3000 && code <= 0x303f) ||
    (code >= 0xff00 && code <= 0xffef);
}

function cleanExtractedText(text) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, lines) => line && line !== lines[index - 1])
    .join("\n")
    .trim();
}

function decodeUtf16LE(bytes) {
  return new TextDecoder("utf-16le").decode(bytes);
}

function decodeAscii(bytes) {
  return new TextDecoder("ascii").decode(bytes);
}

function readUInt32LE(bytes, offset) {
  return bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24);
}

function saveProjectFile() {
  const project = collectProject();
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const filename = `${sanitizeFilename(project.meta.title)}_작업파일.gconti.json`;
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  showExportLink(url, filename, "작업 파일 저장이 시작되지 않으면 ");
}

function loadProjectFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (tryLoadProjectJson(String(reader.result || ""))) {
      setFileStatus(`${file.name} 작업 파일을 불러왔습니다. 계속 편집할 수 있습니다.`, false);
    } else {
      setFileStatus(`${file.name} 파일은 글콘티 작업 파일 형식이 아닙니다.`, true);
    }
  };
  reader.readAsText(file, "utf-8");
  event.target.value = "";
}

function tryLoadProjectJson(text) {
  try {
    const project = JSON.parse(text);
    if (!project || project.type !== "gconti-storyboard-project" || !Array.isArray(project.rows)) {
      return false;
    }
    applyProject(project);
    return true;
  } catch {
    return false;
  }
}

function tryLoadExportedHtml(text) {
  const doc = new DOMParser().parseFromString(text, "text/html");
  const table = doc.querySelector("table");
  const title = doc.querySelector("h1")?.textContent?.trim() || "";
  if (!table || !title.includes("글콘티")) {
    return false;
  }

  const bodyRows = [...table.querySelectorAll("tbody tr")];
  if (!bodyRows.length) {
    return false;
  }

  const rows = bodyRows.map((tr) => {
    const cells = [...tr.querySelectorAll("td")].map((td) => td.textContent.trim());
    const sourceFields = cells.length === legacyFields.length ? legacyFields : fields;
    const row = {};
    sourceFields.forEach((field, index) => {
      row[field] = cells[index] || "";
    });
    enrichImportedRow(row);
    return row;
  });

  const metaText = [...doc.querySelectorAll(".meta span")].map((span) => span.textContent.trim());
  const meta = {
    title: title.replace(/\s*글콘티\s*$/, "") || "새 글콘티",
    author: stripMetaPrefix(metaText.find((item) => item.startsWith("작성자")) || ""),
    version: stripMetaPrefix(metaText.find((item) => item.startsWith("버전")) || "") || "v1.0",
    date: stripMetaPrefix(metaText.find((item) => item.startsWith("작성일")) || "") || new Date().toISOString().slice(0, 10)
  };

  applyProject({
    type: "gconti-storyboard-project",
    meta,
    settings: {
      splitMode: splitMode.value,
      defaultDuration: defaultDuration.value
    },
    sourceText: "",
    rows
  });
  return true;
}

function stripMetaPrefix(value) {
  return value.replace(/^[^:：]*[:：]\s*/, "").trim();
}

function enrichImportedRow(row) {
  const text = [row.visual, row.dialogue, row.caption, row.sound, row.memo].filter(Boolean).join(" ");
  const characters = row.dialogue ? extractCharacters([{ type: "dialogue", text: row.dialogue }]) : [];
  const props = extractProps(text);
  row.frame ||= buildFramePanel(row.visual ? [row.visual] : [], row.dialogue ? [row.dialogue] : [], characters, row.location);
  row.shotSize ||= inferShot(row.visual || text, Boolean(row.dialogue), 0, 1);
  row.angle ||= inferAngle(text, row.shotSize);
  row.camera ||= inferMovement(text);
  row.castProps ||= buildCastProps(characters, props);
  row.lighting ||= inferLighting(row.timeOfDay, text);
}

function collectProject() {
  return {
    type: "gconti-storyboard-project",
    version: 1,
    savedAt: new Date().toISOString(),
    meta: getMeta(),
    settings: {
      splitMode: splitMode.value,
      defaultDuration: defaultDuration.value
    },
    sourceText: sourceText.value,
    rows: getRows()
  };
}

function applyProject(project) {
  const meta = project.meta || {};
  document.querySelector("#projectTitle").value = meta.title || "새 글콘티";
  document.querySelector("#authorName").value = meta.author || "";
  document.querySelector("#versionName").value = meta.version || "v1.0";
  document.querySelector("#createdDate").value = meta.date || new Date().toISOString().slice(0, 10);

  const settings = project.settings || {};
  splitMode.value = settings.splitMode || "auto";
  defaultDuration.value = settings.defaultDuration || 10;
  sourceText.value = project.sourceText || "";
  buildRows(project.rows.length ? project.rows : [emptyRow(1)]);
}

function getExtension(filename) {
  const match = filename.toLowerCase().match(/\.([^.]+)$/);
  return match ? match[1] : "";
}

function normalizeLoadedText(text, extension) {
  if (extension === "html" || extension === "htm") {
    const parsed = new DOMParser().parseFromString(text, "text/html");
    return parsed.body.textContent.replace(/\n{3,}/g, "\n\n").trim();
  }

  if (extension === "json") {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }

  if (extension === "rtf") {
    return text
      .replace(/\\par[d]?/g, "\n")
      .replace(/\\'[0-9a-fA-F]{2}/g, "")
      .replace(/[{}]/g, "")
      .replace(/\\[a-zA-Z]+\d* ?/g, "")
      .trim();
  }

  if (extension === "srt" || extension === "vtt") {
    return text
      .replace(/^\s*WEBVTT\s*/i, "")
      .replace(/^\d+\s*$/gm, "")
      .replace(/\d{2}:\d{2}:\d{2}[,.]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[,.]\d{3}.*$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return text;
}

function setFileStatus(message, isWarning) {
  fileStatus.textContent = message;
  fileStatus.classList.toggle("is-warning", isWarning);
}

function exportHtml() {
  const rows = getRows();
  const meta = getMeta();
  const html = renderExportDocument(meta, rows);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const filename = `${sanitizeFilename(meta.title)}_글콘티.html`;
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  showExportLink(url, filename);
}

function getMeta() {
  return {
    title: document.querySelector("#projectTitle").value || "글콘티",
    author: document.querySelector("#authorName").value || "",
    version: document.querySelector("#versionName").value || "",
    date: document.querySelector("#createdDate").value || ""
  };
}

function showExportLink(url, filename, prefix = "저장이 시작되지 않으면 ") {
  const status = document.querySelector("#exportStatus");
  const oldLink = status.querySelector("a");
  if (oldLink) {
    URL.revokeObjectURL(oldLink.href);
  }
  status.innerHTML = "";
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.textContent = "다운로드 링크";
  status.append(prefix, link, "를 누르세요.");
}

function renderExportDocument(meta, rows) {
  const headers = ["장면", "컷", "예상 시간", "장소", "시간대", "콘티 프레임", "샷/사이즈", "앵글/구도", "카메라", "화면/액션", "대사/내레이션", "자막/VFX", "음향/BGM", "편집/전환", "등장/소품", "조명/톤", "촬영/연출 메모"];
  const keys = fields;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(meta.title)} 글콘티</title>
<style>
body{margin:0;color:#17212b;background:#f6f7f9;font-family:"Segoe UI","Apple SD Gothic Neo","Malgun Gothic",sans-serif}
header{padding:24px 28px;background:#fff;border-bottom:1px solid #d8dee8}
h1{margin:0 0 10px;font-size:30px;letter-spacing:0}
.meta{display:flex;gap:18px;flex-wrap:wrap;color:#637083;font-size:13px;font-weight:700}
main{padding:20px}
.note{margin:0 0 14px;color:#637083;font-size:13px}
.wrap{overflow:auto;background:#fff;border:1px solid #d8dee8}
table{width:max(1280px,100%);border-collapse:collapse}
th,td{border:1px solid #d8dee8;padding:8px;vertical-align:top}
th{background:#eaf0f6;text-align:left;font-size:13px}
td{min-width:100px;background:#fff}
td:nth-child(6),td:nth-child(7),td:nth-child(11){min-width:220px}
[contenteditable]{min-height:48px;outline:0;white-space:pre-wrap}
[contenteditable]:focus{box-shadow:inset 0 0 0 2px rgba(37,99,235,.25);background:#fbfdff}
@media print{body{background:#fff}main{padding:0}.note{display:none}.wrap{border:0;overflow:visible}table{width:100%;font-size:11px}}
</style>
</head>
<body>
<header>
<h1 contenteditable="true">${escapeHtml(meta.title)} 글콘티</h1>
<div class="meta">
<span contenteditable="true">작성자: ${escapeHtml(meta.author)}</span>
<span contenteditable="true">버전: ${escapeHtml(meta.version)}</span>
<span contenteditable="true">작성일: ${escapeHtml(meta.date)}</span>
</div>
</header>
<main>
<p class="note">모든 셀은 클릭해서 바로 수정할 수 있습니다. 수정 후 브라우저의 저장 기능으로 보관하거나 인쇄/PDF로 출력하세요.</p>
<div class="wrap">
<table>
<thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
<tbody>
${rows.map((row) => `<tr>${keys.map((key) => `<td><div contenteditable="true">${escapeHtml(row[key] || "")}</div></td>`).join("")}</tr>`).join("\n")}
</tbody>
</table>
</div>
</main>
</body>
</html>`;
}

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "글콘티";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

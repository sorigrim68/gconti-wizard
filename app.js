const fields = [
  "scene",
  "cut",
  "duration",
  "location",
  "timeOfDay",
  "visual",
  "dialogue",
  "caption",
  "sound",
  "transition",
  "memo"
];

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
const conversionExtensions = new Set(["doc", "docx", "pdf", "hwp", "hwpx", "odt"]);
const browserParsedExtensions = new Set(["docx", "pdf", "hwpx", "odt"]);

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

function emptyRow(index) {
  return {
    scene: String(index).padStart(2, "0"),
    cut: "1",
    duration: `${defaultDuration.value || 10}초`,
    location: "",
    timeOfDay: "",
    visual: "",
    dialogue: "",
    caption: "",
    sound: "",
    transition: "",
    memo: ""
  };
}

function parseScript(text) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [emptyRow(1)];
  }

  const chunks = splitIntoScenes(normalized);
  return chunks.map((chunk, index) => sceneToRow(chunk, index + 1));
}

function splitIntoScenes(text) {
  if (splitMode.value === "paragraph") {
    return text.split(/\n\s*\n+/).map((part) => part.trim()).filter(Boolean);
  }

  const lines = text.split("\n");
  const chunks = [];
  let current = [];
  const headingPattern = /^\s*((S|SCENE|씬|장면|#)\s*#?\s*\d+|\d+\s*[.)]|(INT|EXT|I\/E)\.)/i;

  lines.forEach((line) => {
    const isHeading = headingPattern.test(line);
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

function sceneToRow(chunk, index) {
  const lines = chunk.split("\n").map((line) => line.trim()).filter(Boolean);
  const heading = lines[0] || "";
  const body = lines.slice(1);
  const row = emptyRow(index);
  const headingParts = parseHeading(heading);
  row.scene = headingParts.scene || row.scene;
  row.location = headingParts.location;
  row.timeOfDay = headingParts.timeOfDay;

  const dialogue = [];
  const caption = [];
  const sound = [];
  const visual = [];

  body.forEach((line) => {
    if (/^(자막|그래픽|CG|SUPER)\s*[:：]/i.test(line)) {
      caption.push(line.replace(/^(자막|그래픽|CG|SUPER)\s*[:：]\s*/i, ""));
    } else if (/^(음향|효과음|SFX|BGM|음악)\s*[:：]/i.test(line) || /(소리|음악|BGM|효과음)/i.test(line)) {
      sound.push(line.replace(/^(음향|효과음|SFX|BGM|음악)\s*[:：]\s*/i, ""));
    } else if (/^[가-힣A-Za-z0-9 _-]{1,18}\s*[:：]/.test(line)) {
      dialogue.push(line);
    } else {
      visual.push(line);
    }
  });

  row.visual = visual.join("\n") || (body.length ? body.join("\n") : heading);
  row.dialogue = dialogue.join("\n");
  row.caption = caption.join("\n");
  row.sound = sound.join("\n");
  row.memo = body.length ? "원문 자동 분석 후 필요 항목을 검토하세요." : "";
  return row;
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

function buildRows(rows) {
  tbody.innerHTML = "";
  rows.forEach(appendRow);
}

function appendRow(row) {
  const node = template.content.firstElementChild.cloneNode(true);
  fields.forEach((field) => {
    const control = node.querySelector(`[data-field="${field}"]`);
    control.value = row[field] || "";
  });
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
}

async function loadTextFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const extension = getExtension(file.name);

  if (extension === "doc" || extension === "hwp") {
    setFileStatus(`${file.name} 파일은 오래된 바이너리 문서 형식이라 브라우저에서 안정적으로 추출하기 어렵습니다. DOCX/HWPX/PDF/TXT로 변환해 불러오세요.`, true);
    event.target.value = "";
    return;
  }

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
  if (extension === "docx") {
    return readDocx(file);
  }
  if (extension === "pdf") {
    return readPdf(file);
  }
  if (extension === "hwpx") {
    return readZipXmlText(file, /Contents\/section\d+\.xml$/i);
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
    const row = {};
    fields.forEach((field, index) => {
      row[field] = cells[index] || "";
    });
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
  const headers = ["장면", "컷", "예상 시간", "장소", "시간대", "화면/액션", "대사/내레이션", "자막/그래픽", "음향/BGM", "전환/효과", "촬영/연출 메모"];
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

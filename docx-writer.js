/* docx-writer.js — minimal, dependency-free .docx (OOXML) generator.
   No CDN, no build step: hand-rolled ZIP (stored/uncompressed entries)
   containing the small set of OOXML parts Word needs to open a document.
   Public API: buildDocxBlob(blocks, meta) -> Blob
   `blocks` is a small internal document model — see the block shapes below. */

/* ---------------------------------------------------------------------- */
/* ZIP (store method — no compression, no external deflate dependency)    */
/* ---------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const dosTime = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const dosDate = (((Math.max(0, date.getFullYear() - 1980)) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

function strToBytes(str) {
  return new TextEncoder().encode(str);
}

function u16(view, offset, value) {
  view.setUint16(offset, value, true);
}
function u32(view, offset, value) {
  view.setUint32(offset, value, true);
}

// Builds a ZIP archive from [{name, data(string|Uint8Array)}], stored (uncompressed).
function zipToBlob(files) {
  const { dosTime, dosDate } = dosDateTime(new Date());
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = strToBytes(file.name);
    const data = typeof file.data === "string" ? strToBytes(file.data) : file.data;
    const crc = crc32(data);

    const local = new ArrayBuffer(30);
    const lv = new DataView(local);
    u32(lv, 0, 0x04034b50);
    u16(lv, 4, 20); // version needed
    u16(lv, 6, 0); // flags
    u16(lv, 8, 0); // method: store
    u16(lv, 10, dosTime);
    u16(lv, 12, dosDate);
    u32(lv, 14, crc);
    u32(lv, 18, data.length); // compressed size == uncompressed (store)
    u32(lv, 22, data.length);
    u16(lv, 26, nameBytes.length);
    u16(lv, 28, 0); // extra field length
    localChunks.push(new Uint8Array(local), nameBytes, data);

    const central = new ArrayBuffer(46);
    const cv = new DataView(central);
    u32(cv, 0, 0x02014b50);
    u16(cv, 4, 20); // version made by
    u16(cv, 6, 20); // version needed
    u16(cv, 8, 0); // flags
    u16(cv, 10, 0); // method
    u16(cv, 12, dosTime);
    u16(cv, 14, dosDate);
    u32(cv, 16, crc);
    u32(cv, 20, data.length);
    u32(cv, 24, data.length);
    u16(cv, 28, nameBytes.length);
    u16(cv, 30, 0); // extra length
    u16(cv, 32, 0); // comment length
    u16(cv, 34, 0); // disk number start
    u16(cv, 36, 0); // internal attrs
    u32(cv, 38, 0); // external attrs
    u32(cv, 42, offset); // relative offset of local header
    centralChunks.push(new Uint8Array(central), nameBytes);

    offset += local.byteLength + nameBytes.length + data.length;
  });

  const centralStart = offset;
  let centralSize = 0;
  centralChunks.forEach((c) => (centralSize += c.length));

  const eocd = new ArrayBuffer(22);
  const ev = new DataView(eocd);
  u32(ev, 0, 0x06054b50);
  u16(ev, 4, 0); // disk number
  u16(ev, 6, 0); // disk with central dir
  u16(ev, 8, files.length);
  u16(ev, 10, files.length);
  u32(ev, 12, centralSize);
  u32(ev, 16, centralStart);
  u16(ev, 20, 0); // comment length

  return new Blob([...localChunks, ...centralChunks, new Uint8Array(eocd)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

/* ---------------------------------------------------------------------- */
/* OOXML document.xml construction from a small block model               */
/* ---------------------------------------------------------------------- */

function xmlEscape(str) {
  return String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// run: {text, bold, italic, underline, strike, color("RRGGBB"), size(half-points),
//       revision: "ins"|"del"} — a revisioned run renders via <w:delText> instead
// of <w:t> when deleted (required by the OOXML schema for tracked deletions);
// the surrounding <w:ins>/<w:del> wrapper is added by runsWithRevisionsXml,
// not here, since it wraps a *group* of consecutive same-revision runs.
function runXml(run) {
  if (typeof run === "string") run = { text: run };
  const props = [];
  if (run.bold) props.push("<w:b/>");
  if (run.italic) props.push("<w:i/>");
  if (run.underline) props.push("<w:u w:val=\"single\"/>");
  if (run.strike) props.push("<w:strike/>");
  if (run.color) props.push(`<w:color w:val="${run.color}"/>`);
  if (run.size) props.push(`<w:sz w:val="${run.size}"/><w:szCs w:val="${run.size}"/>`);
  const rPr = props.length ? `<w:rPr>${props.join("")}</w:rPr>` : "";
  const textTag = run.revision === "del" ? "w:delText" : "w:t";
  return `<w:r>${rPr}<${textTag} xml:space="preserve">${xmlEscape(run.text)}</${textTag}></w:r>`;
}

// Real tracked-change metadata (author/date) for the document currently being
// built — set once per blocksToDocumentXml() call rather than threaded
// through every paragraphXml/tableXml call site. Word's Review pane groups
// revisions by author and reads w:date for the "changed on" timestamp; both
// are required attributes on <w:ins>/<w:del>.
let CURRENT_REVISION_META = null;

// Wraps each run of consecutive same-revision runs in a single <w:ins> or
// <w:del> — the actual OOXML construct Word's Track Changes / Review pane
// recognizes and can Accept/Reject, as opposed to a run that merely *looks*
// like a tracked change via manual strikethrough/underline styling.
function runsWithRevisionsXml(runs) {
  const meta = CURRENT_REVISION_META || {};
  const author = xmlEscape(meta.author || "ISDA Master Agreement Jigsaw");
  const date = meta.date || new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const out = [];
  let i = 0;
  while (i < runs.length) {
    const run = typeof runs[i] === "string" ? { text: runs[i] } : runs[i];
    if (!run.revision) {
      out.push(runXml(run));
      i++;
      continue;
    }
    const revision = run.revision;
    const group = [];
    while (i < runs.length) {
      const r = typeof runs[i] === "string" ? { text: runs[i] } : runs[i];
      if (r.revision !== revision) break;
      group.push(r);
      i++;
    }
    const id = meta.nextId ? meta.nextId() : 1;
    const tag = revision === "del" ? "w:del" : "w:ins";
    out.push(`<${tag} w:id="${id}" w:author="${author}" w:date="${date}">${group.map(runXml).join("")}</${tag}>`);
  }
  return out.join("");
}

function paragraphXml(runs, opts) {
  opts = opts || {};
  const pPrParts = [];
  if (opts.style) pPrParts.push(`<w:pStyle w:val="${opts.style}"/>`);
  if (opts.spacingBefore != null || opts.spacingAfter != null) {
    pPrParts.push(`<w:spacing${opts.spacingBefore != null ? ` w:before="${opts.spacingBefore}"` : ""}${opts.spacingAfter != null ? ` w:after="${opts.spacingAfter}"` : ""}/>`);
  }
  if (opts.borderBottom) {
    pPrParts.push('<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="999999"/></w:pBdr>');
  }
  if (opts.indent) pPrParts.push(`<w:ind w:left="${opts.indent}"/>`);
  const pPr = pPrParts.length ? `<w:pPr>${pPrParts.join("")}</w:pPr>` : "";
  const runsXml = runsWithRevisionsXml(runs || []);
  return `<w:p>${pPr}${runsXml}</w:p>`;
}

function tableXml(headers, rows) {
  const borders =
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`)
      .join('') +
    '</w:tblBorders>';
  const tblPr = `<w:tblPr><w:tblW w:w="0" w:type="auto"/>${borders}<w:tblLayout w:type="fixed"/></w:tblPr>`;
  // cellContent is normally a plain string, but may be an array of run
  // objects (see runXml's run shape) — table diffs in a Schedule redline
  // need per-run strikethrough/underline within a single cell, which a bare
  // string can't carry.
  const cell = (cellContent, bold) => {
    const runs = Array.isArray(cellContent) ? cellContent.map((r) => ({ ...r, size: r.size || 20, bold: bold || r.bold })) : [{ text: cellContent, bold: !!bold, size: 20 }];
    return `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${bold ? '<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/>' : ""}</w:tcPr>${paragraphXml(runs)}</w:tc>`;
  };
  const headerRow = headers ? `<w:tr>${headers.map((h) => cell(h, true)).join("")}</w:tr>` : "";
  const bodyRows = rows.map((r) => `<w:tr>${r.map((c) => cell(c, false)).join("")}</w:tr>`).join("");
  return `<w:tbl>${tblPr}${headerRow}${bodyRows}</w:tbl>`;
}

function blocksToDocumentXml(blocks, meta) {
  let idCounter = 1;
  CURRENT_REVISION_META = {
    author: (meta && meta.creator) || "ISDA Master Agreement Jigsaw",
    date: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    nextId: () => idCounter++,
  };
  const body = [];
  blocks.forEach((b) => {
    if (b.type === "title") {
      body.push(paragraphXml([{ text: b.text, bold: true, size: 36 }], { style: "Title", spacingAfter: 120 }));
    } else if (b.type === "subtitle") {
      body.push(paragraphXml([{ text: b.text, italic: true, color: "555555", size: 20 }], { style: "Subtitle", spacingAfter: 240 }));
    } else if (b.type === "heading1") {
      body.push(paragraphXml([{ text: b.text, bold: true, size: 28 }], { style: "Heading1", spacingBefore: 360, spacingAfter: 160 }));
    } else if (b.type === "heading2") {
      body.push(paragraphXml([{ text: b.text, bold: true, size: 24 }], { style: "Heading2", spacingBefore: 280, spacingAfter: 120 }));
    } else if (b.type === "heading3") {
      body.push(paragraphXml([{ text: b.text, bold: true, italic: true, size: 22 }], { style: "Heading3", spacingBefore: 200, spacingAfter: 100 }));
    } else if (b.type === "paragraph") {
      body.push(paragraphXml(b.runs, { spacingAfter: 160, indent: b.indent }));
    } else if (b.type === "table") {
      body.push(tableXml(b.headers, b.rows));
      body.push(paragraphXml([], { spacingAfter: 160 }));
    } else if (b.type === "hr") {
      body.push(paragraphXml([{ text: "" }], { borderBottom: true, spacingAfter: 200 }));
    } else if (b.type === "pagebreak") {
      body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
    } else if (b.type === "spacer") {
      body.push(paragraphXml([], { spacingAfter: b.size || 120 }));
    }
  });
  const sectPr =
    '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>' +
    '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
  const xml =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${body.join("")}${sectPr}</w:body></w:document>`;
  CURRENT_REVISION_META = null;
  return xml;
}

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>' +
  '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/></w:style>' +
  '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/></w:style>' +
  '</w:styles>';

const CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>' +
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
  '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
  '</Types>';

// w:trackChanges turns on "recording" mode so any FURTHER edits opposing
// counsel makes in Word are themselves recorded as tracked changes — the
// existing <w:ins>/<w:del> revisions from this export render and are
// Accept/Reject-able regardless of this setting, but turning it on keeps the
// document behaving as a live negotiation draft rather than a one-off export.
const SETTINGS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:trackChanges/>' +
  '</w:settings>';

const ROOT_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
  '</Relationships>';

const DOC_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>' +
  '</Relationships>';

function buildCoreXml(meta) {
  meta = meta || {};
  const iso = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${xmlEscape(meta.title || "Document")}</dc:title>` +
    `<dc:creator>${xmlEscape(meta.creator || "ISDA Master Agreement Jigsaw")}</dc:creator>` +
    `<cp:lastModifiedBy>${xmlEscape(meta.creator || "ISDA Master Agreement Jigsaw")}</cp:lastModifiedBy>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified>` +
    '</cp:coreProperties>'
  );
}

const APP_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
  '<Application>ISDA Master Agreement Jigsaw</Application>' +
  '</Properties>';

function buildDocxBlob(blocks, meta) {
  const files = [
    { name: "[Content_Types].xml", data: CONTENT_TYPES_XML },
    { name: "_rels/.rels", data: ROOT_RELS_XML },
    { name: "docProps/core.xml", data: buildCoreXml(meta) },
    { name: "docProps/app.xml", data: APP_XML },
    { name: "word/document.xml", data: blocksToDocumentXml(blocks, meta) },
    { name: "word/styles.xml", data: STYLES_XML },
    { name: "word/settings.xml", data: SETTINGS_XML },
    { name: "word/_rels/document.xml.rels", data: DOC_RELS_XML },
  ];
  return zipToBlob(files);
}

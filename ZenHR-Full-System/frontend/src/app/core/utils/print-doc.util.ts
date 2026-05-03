export interface PrintField {
  label: string;
  value: string;
  span?: boolean;
}

export interface PrintSig {
  label: string;
}

export interface PrintDocOpts {
  lang: 'ar' | 'en';
  docType: string;
  title: string;
  subtitle?: string;
  companyNameAr?: string;
  companyNameEn?: string;
  fields: PrintField[];
  tableHeaders?: string[];
  tableRows?: string[][];
  summaryLabel?: string;
  summaryValue?: string;
  notes?: string;
  signatures?: PrintSig[];
  autoClose?: boolean;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function openPrintDoc(opts: PrintDocOpts): void {
  const popup = window.open('', '_blank', 'width=1040,height=820');
  if (!popup) return;

  const ar = opts.lang === 'ar';
  const dir = ar ? 'rtl' : 'ltr';
  const now = new Date();
  const dateStr = now.toLocaleDateString(ar ? 'ar-JO-u-nu-latn' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  const refNum = `${opts.docType}-${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const companyName = ar ? (opts.companyNameAr || 'ZenJO') : (opts.companyNameEn || 'ZenJO');

  const fieldsHtml = opts.fields.map(f =>
    `<div class="field${f.span ? ' field-span' : ''}">
      <div class="fl">${f.label}</div>
      <div class="fv">${f.value !== '' && f.value != null ? f.value : '—'}</div>
    </div>`
  ).join('');

  const sigCols = opts.signatures && opts.signatures.length >= 3 ? 3 : 2;
  const tableHtml = (opts.tableHeaders && opts.tableRows && opts.tableRows.length > 0)
    ? `<table>
        <thead><tr>${opts.tableHeaders.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${opts.tableRows.map(row =>
          `<tr>${row.map((cell, i) =>
            `<td${i === row.length - 1 ? ' class="amount"' : ''}>${cell}</td>`
          ).join('')}</tr>`
        ).join('')}</tbody>
      </table>`
    : '';

  const summaryHtml = opts.summaryLabel && opts.summaryValue
    ? `<div class="net-box">
        <span class="net-label">${opts.summaryLabel}</span>
        <span class="net-val">${opts.summaryValue}</span>
      </div>`
    : '';

  const notesHtml = opts.notes
    ? `<div class="doc-notes"><span class="fl">${ar ? 'ملاحظات' : 'Notes'}:</span> ${opts.notes}</div>`
    : '';

  const sigsHtml = opts.signatures && opts.signatures.length > 0
    ? `<div class="sigs" style="grid-template-columns:repeat(${sigCols},minmax(0,1fr))">
        ${opts.signatures.map(s =>
          `<div class="sig-box">
            <div class="sig-line"></div>
            <div class="sig-label">${s.label}</div>
          </div>`
        ).join('')}
      </div>`
    : '';

  const closeScript = (opts.autoClose !== false)
    ? `<script>window.onload=function(){window.print();window.onafterprint=function(){window.close()};};<\/script>`
    : `<script>window.onload=function(){window.print()};<\/script>`;

  const html = `<!DOCTYPE html>
<html dir="${dir}" lang="${ar ? 'ar' : 'en'}">
<head>
<meta charset="UTF-8">
<title>${opts.title}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:${ar ? "'Segoe UI',Tahoma,Arial" : "'Segoe UI',Arial"},sans-serif;font-size:12px;color:#1a202c;direction:${dir};background:#fff}
  .page{max-width:780px;margin:20px auto;padding:32px;border:1px solid #e2e8f0;border-radius:8px}
  .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:16px;border-bottom:3px solid #1a6b4a}
  .co{font-size:22px;font-weight:800;color:#1a6b4a;letter-spacing:-.5px}
  .co-sub{font-size:10px;color:#718096;margin-top:3px;font-weight:400}
  .doc-right{text-align:${ar ? 'left' : 'right'}}
  .doc-title{font-size:16px;font-weight:700;color:#2d3748}
  .doc-sub{font-size:11px;color:#718096;margin-top:4px}
  .meta{display:flex;gap:28px;margin-bottom:20px;padding:10px 16px;background:#f7fafc;border-radius:6px;border:1px solid #e8edf0}
  .meta-item{display:flex;flex-direction:column;gap:2px}
  .meta-lbl{font-size:9px;color:#718096;text-transform:uppercase;letter-spacing:.5px}
  .meta-val{font-weight:700;font-size:12px;color:#2d3748}
  .fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;margin-bottom:18px}
  .field{border:1px solid #e8edf0;border-radius:8px;padding:10px 14px;background:#fafbfc}
  .field-span{grid-column:1/-1}
  .fl{font-size:10px;color:#718096;margin-bottom:5px}
  .fv{font-weight:700;font-size:12px;color:#1a202c}
  table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:11px}
  thead th{background:#1a6b4a;color:#fff;padding:8px 12px;text-align:${ar ? 'right' : 'left'};-webkit-print-color-adjust:exact;print-color-adjust:exact}
  tbody td{padding:6px 12px;border-bottom:1px solid #edf2f7}
  tbody tr:nth-child(even) td{background:#f9fbfa}
  tbody tr:last-child td{border-bottom:none;font-weight:700;background:#f0f7f3}
  .amount{font-weight:600;text-align:${ar ? 'left' : 'right'}}
  .net-box{background:#1a6b4a;color:#fff;border-radius:8px;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .net-label{font-size:13px;font-weight:700}
  .net-val{font-size:22px;font-weight:800;letter-spacing:-.5px}
  .doc-notes{font-size:11px;color:#4a5568;margin-bottom:18px;padding:10px 14px;background:#fffbeb;border-radius:6px;border:1px solid #fbd38d}
  .sigs{display:grid;gap:28px;padding-top:32px;margin-top:16px;border-top:1px dashed #d1d5db}
  .sig-box{display:flex;flex-direction:column;gap:6px}
  .sig-line{border-top:1px solid #9ca3af;margin-top:52px}
  .sig-label{font-size:11px;color:#4a5568;padding-top:6px;font-weight:500}
  .footer{margin-top:28px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#a0aec0}
  @media print{
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .page{border:none;margin:0;padding:24px}
    @page{margin:1.5cm}
  }
</style>
</head>
<body>
<div class="page">
  <div class="hdr">
    <div>
      <div class="co">${companyName}</div>
      <div class="co-sub">${ar ? 'نظام إدارة الموارد البشرية الأردنية' : 'Jordanian HR Management System'}</div>
    </div>
    <div class="doc-right">
      <div class="doc-title">${opts.title}</div>
      ${opts.subtitle ? `<div class="doc-sub">${opts.subtitle}</div>` : ''}
    </div>
  </div>
  <div class="meta">
    <div class="meta-item">
      <span class="meta-lbl">${ar ? 'رقم المرجع' : 'Reference'}</span>
      <span class="meta-val">${refNum}</span>
    </div>
    <div class="meta-item">
      <span class="meta-lbl">${ar ? 'تاريخ الطباعة' : 'Print Date'}</span>
      <span class="meta-val">${dateStr}</span>
    </div>
  </div>
  <div class="fields">${fieldsHtml}</div>
  ${tableHtml}
  ${summaryHtml}
  ${notesHtml}
  ${sigsHtml}
  <div class="footer">
    <span>${ar ? 'تم إنشاؤه بواسطة نظام ZenJO لإدارة الموارد البشرية' : 'Generated by ZenJO HR Management System'}</span>
    <span>${dateStr}</span>
  </div>
</div>
${closeScript}
</body>
</html>`;

  popup.document.write(html);
  popup.document.close();
}

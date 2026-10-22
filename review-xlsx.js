/* Local browser XLSX export. No network service or Python environment required. */
(function (root) {
  'use strict';
  const columns = ['block_id','street_name','rank','status','note','extent','manager','manager_note','name_confidence','road_authority','is_bridge','diagnosis_code','diagnosis','priority_score','exposure_share','length_m','shade_buildings','tree_contribution','shade_total','unshaded_frac','unshaded_length_m','longest_unshaded_m','route_count','route_count_max','route_count_range','member_count','updated_at'];
  const integers = new Set(['rank','is_bridge','route_count_max','route_count_range','member_count']);
  const numbers = new Set(['priority_score','exposure_share','length_m','shade_buildings','tree_contribution','shade_total','unshaded_frac','unshaded_length_m','longest_unshaded_m','route_count',...integers]);
  const proportions = new Set(['shade_buildings','tree_contribution','shade_total','unshaded_frac']);
  const xml = value => String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  function letter(index) { let s=''; for(index++;index;index=Math.floor((index-1)/26))s=String.fromCharCode(65+(index-1)%26)+s; return s; }
  function cell(ref,value,style=0,numeric=false) {
    if(numeric && value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)))return `<c r="${ref}" s="${style}"><v>${Number(value)}</v></c>`;
    // Inline text remains literal even when a note starts with '=' or '+'.
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  }
  const encoder = new TextEncoder();
  const crcTable = Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
  function crc32(bytes) {let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
  function zip(files) {
    const parts=[],central=[];let offset=0,centralSize=0;
    for(const [name,body] of Object.entries(files)) {
      const filename=encoder.encode(name),data=encoder.encode(body),crc=crc32(data);
      const local=new Uint8Array(30+filename.length),v=new DataView(local.buffer);
      v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,filename.length,true);local.set(filename,30);
      const entry=new Uint8Array(46+filename.length),e=new DataView(entry.buffer);
      e.setUint32(0,0x02014b50,true);e.setUint16(4,20,true);e.setUint16(6,20,true);e.setUint16(8,0x800,true);e.setUint16(14,33,true);e.setUint32(16,crc,true);e.setUint32(20,data.length,true);e.setUint32(24,data.length,true);e.setUint16(28,filename.length,true);e.setUint32(42,offset,true);entry.set(filename,46);
      parts.push(local,data);central.push(entry);offset+=local.length+data.length;centralSize+=entry.length;
    }
    const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,central.length,true);v.setUint16(10,central.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
    const out=new Uint8Array(offset+centralSize+22);let p=0;for(const part of [...parts,...central,end]){out.set(part,p);p+=part.length;}return out;
  }
  function build(records, metadata={}) {
    const last=4+records.length,endCol=letter(columns.length-1);
    const widths=columns.map((key,i)=>({i:i+1,width:key==='note'?52:key==='street_name'?27:key==='extent'||key==='manager_note'?38:key==='updated_at'?27:key==='rank'?9:key==='diagnosis'?28:key==='block_id'?17:key==='status'?18:20}));
    let rows=`<row r="1" ht="30" customHeight="1">${cell('A1','Street shade improvement · Field review',1)}</row><row r="2" ht="46" customHeight="1">${cell('A2','Edit only the blue status and note cells. Model fields are locked. Save the workbook, then use Import worklist to preview and apply review changes. Model rankings are never changed.',2)}</row><row r="4" ht="42" customHeight="1">${columns.map((c,i)=>cell(letter(i)+'4',c,3)).join('')}</row>`;
    for(let i=0;i<records.length;i++) {
      const r=i+5;rows+=`<row r="${r}" ht="48" customHeight="1">${columns.map((key,j)=>cell(letter(j)+r,records[i][key],key==='status'||key==='note'?4:proportions.has(key)?6:key==='exposure_share'?8:integers.has(key)?7:numbers.has(key)?5:0,numbers.has(key))).join('')}</row>`;
    }
    const validation=records.length?`<autoFilter ref="A4:${endCol}${last}"/><mergeCells count="2"><mergeCell ref="A1:H1"/><mergeCell ref="A2:H2"/></mergeCells><dataValidations count="2"><dataValidation type="list" allowBlank="0" showInputMessage="1" showErrorMessage="1" errorStyle="stop" errorTitle="Choose a review status" error="Use To inspect, Retain or Defer." promptTitle="Editable review status" prompt="Choose from the dropdown." sqref="D5:D${last}"><formula1>"To inspect,Retain,Defer"</formula1></dataValidation><dataValidation type="textLength" operator="lessThanOrEqual" allowBlank="1" showErrorMessage="1" errorStyle="stop" errorTitle="Note too long" error="Use at most 2000 characters." sqref="E5:E${last}"><formula1>2000</formula1></dataValidation></dataValidations>`:`<mergeCells count="2"><mergeCell ref="A1:H1"/><mergeCell ref="A2:H2"/></mergeCells>`;
    const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${ns}"><dimension ref="A1:${endCol}${last}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="3" ySplit="4" topLeftCell="D5" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="D5" sqref="D5"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${widths.map(c=>`<col min="${c.i}" max="${c.i}" width="${c.width}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData><sheetProtection sheet="1" objects="1" scenarios="1" selectLockedCells="0" selectUnlockedCells="0" autoFilter="0"/>${validation}<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
    const xf=(font,fill,num=0,extra='')=>`<xf numFmtId="${num}" fontId="${font}" fillId="${fill}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1" ${extra?'applyProtection="1"':''}><alignment vertical="top" wrapText="1"/>${extra}</xf>`;
    const styles=`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="${ns}"><numFmts count="2"><numFmt numFmtId="164" formatCode="0.00"/><numFmt numFmtId="165" formatCode="0.00&amp;quot;%&amp;quot;"/></numFmts><fonts count="4"><font><sz val="11"/><color rgb="FF243D35"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><sz val="11"/><color rgb="FF155A96"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF245746"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE6F2FF"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="9">${xf(0,0)}${xf(1,2)}${xf(0,0)}${xf(2,2)}${xf(3,3,0,'<protection locked="0"/>')}${xf(0,0,164)}${xf(0,0,10)}${xf(0,0,3)}${xf(0,0,165)}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    const metaRows=Object.entries({schema:'melbourne-shade-plan-v1',scenario:'2026-01-27_1600-1900',model_version:metadata.model_version||'',exported_at:new Date().toISOString()}).map(([key,value],i)=>`<row r="${i+1}">${cell('A'+(i+1),key)}${cell('B'+(i+1),value)}</row>`).join('');
    return zip({
      '[Content_Types].xml':`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
      '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml':`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Field review" sheetId="1" r:id="rId1"/><sheet name="Worklist metadata" sheetId="2" state="hidden" r:id="rId3"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
      'xl/styles.xml':styles.replace('0.00&amp;quot;%&amp;quot;','0.00&quot;%&quot;'),
      'xl/worksheets/sheet1.xml':sheet,
      'xl/worksheets/sheet2.xml':`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}"><sheetData>${metaRows}</sheetData></worksheet>`
    });
  }
  root.ShadeReviewXlsx={build,columns};
})(typeof window==='undefined'?globalThis:window);

/* Worklist import changes review records only; model properties are never assigned. */
(function(root){
 'use strict';
 const SCHEMA='melbourne-shade-plan-v1',SCENARIO='2026-01-27_1600-1900';
 function modelVersion(features){
  const text=features.map(f=>{const p=f.properties;return [p.block_id,p.rank,p.priority_score,p.diagnosis_code].join('|')}).sort().join('\n');
  let hash=2166136261;for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619)}return 'blocks-'+(hash>>>0).toString(16).padStart(8,'0');
 }
 function parseXml(text){const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw new Error('The workbook contains invalid XML');return doc;}
 const elements=(node,tag)=>Array.from(node.getElementsByTagNameNS('*',tag));
 async function unzip(buffer){
  const bytes=new Uint8Array(buffer),v=new DataView(buffer);let end=-1;
  for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(v.getUint32(p,true)===0x06054b50){end=p;break}
  if(end<0)throw new Error('This is not a valid .xlsx workbook');
  const count=v.getUint16(end+10,true);let pos=v.getUint32(end+16,true),total=0;const out=new Map();
  if(count>1500)throw new Error('The workbook contains too many files');
  for(let i=0;i<count;i++){
   if(pos+46>bytes.length||v.getUint32(pos,true)!==0x02014b50)throw new Error('The workbook ZIP directory is invalid');
   const flags=v.getUint16(pos+8,true),method=v.getUint16(pos+10,true),size=v.getUint32(pos+20,true),rawSize=v.getUint32(pos+24,true),nl=v.getUint16(pos+28,true),el=v.getUint16(pos+30,true),cl=v.getUint16(pos+32,true),local=v.getUint32(pos+42,true);
   if(flags&1)throw new Error('Password-encrypted workbooks are not supported');
   total+=rawSize;if(rawSize>12000000||total>30000000)throw new Error('The expanded workbook is too large');
   const name=new TextDecoder().decode(bytes.slice(pos+46,pos+46+nl));pos+=46+nl+el+cl;
   if(!name.endsWith('.xml')&&!name.endsWith('.rels'))continue;
   if(local+30>bytes.length||v.getUint32(local,true)!==0x04034b50)throw new Error('The workbook ZIP entry is invalid');
   const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);if(start+size>bytes.length)throw new Error('The workbook is truncated');
   let data=bytes.slice(start,start+size);
   if(method===8){
    if(typeof DecompressionStream==='undefined')throw new Error('Use a current Chrome or Edge browser to import Excel');
    const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];let length=0;
    for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>rawSize||length>12000000){await reader.cancel();throw new Error('The workbook expands beyond its declared size')}chunks.push(part.value)}
    data=new Uint8Array(length);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length}
   }else if(method!==0)throw new Error('The workbook uses unsupported ZIP compression');
   if(data.length!==rawSize)throw new Error('The workbook entry size is invalid');
   if(out.has(name))throw new Error('The workbook contains duplicate ZIP entries');out.set(name,new TextDecoder().decode(data));
  }
  return out;
 }
 function sheetRows(doc,strings){
  return elements(doc,'row').map(row=>{const cells={};for(const c of elements(row,'c')){
   const ref=c.getAttribute('r')||'';const col=ref.match(/^[A-Z]+/)?.[0];if(!col)continue;
   if(elements(c,'f').length)throw new Error(`Formula cell ${ref} is not supported. Paste values instead.`);
   const type=c.getAttribute('t'),value=elements(c,'v')[0]?.textContent||'';
   cells[col]=type==='inlineStr'?elements(c,'t').map(t=>t.textContent).join(''):type==='s'?(strings[Number(value)]??''):value;
  }return {number:Number(row.getAttribute('r')),cells}});
 }
 async function readXlsx(buffer){
  const files=await unzip(buffer),xmlFile=name=>{if(!files.has(name))throw new Error(`Missing workbook file: ${name}`);return parseXml(files.get(name))};
  const workbook=xmlFile('xl/workbook.xml'),rels=xmlFile('xl/_rels/workbook.xml.rels');
  const targets=new Map(elements(rels,'Relationship').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));
  function getSheet(name){const sheet=elements(workbook,'sheet').find(s=>s.getAttribute('name')===name);if(!sheet)return null;
   const target=targets.get(sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'));
   if(!target||target.includes('..'))throw new Error('Invalid workbook sheet reference');return xmlFile(target.startsWith('/')?target.slice(1):'xl/'+target);
  }
  const strings=files.has('xl/sharedStrings.xml')?elements(xmlFile('xl/sharedStrings.xml'),'si').map(si=>elements(si,'t').map(t=>t.textContent).join('')):[];
  const sheet=getSheet('Field review');if(!sheet)throw new Error('Choose an Excel worklist exported by this dashboard (Field review sheet)');
  const rows=sheetRows(sheet,strings);let header=null,index=-1;
  for(let i=0;i<Math.min(30,rows.length);i++)if(Object.values(rows[i].cells).includes('block_id')){header=rows[i].cells;index=i;break}
  if(!header)throw new Error('The Field review sheet has no block_id header');
  const columns={};for(const [col,value] of Object.entries(header))if(['block_id','status','note'].includes(value)){if(columns[value])throw new Error(`Duplicate ${value} header`);columns[value]=col}
  for(const key of ['block_id','status','note'])if(!columns[key])throw new Error(`Missing ${key} column`);
  const records=rows.slice(index+1).filter(r=>Object.values(r.cells).some(v=>String(v).trim()!=='')).map(r=>({block_id:r.cells[columns.block_id]||'',status:r.cells[columns.status]||'',note:r.cells[columns.note]||'',row:r.number}));
  const metadata=getSheet('Worklist metadata');const meta=metadata?Object.fromEntries(sheetRows(metadata,strings).map(r=>[r.cells.A,r.cells.B])):{};
  return {schema:meta.schema,scenario:meta.scenario,model_version:meta.model_version,records,legacy:!metadata};
 }
 function prepare(data,features,plan,options={}){
  if(!data.legacy&&(data.schema!==SCHEMA||data.scenario!==SCENARIO))throw new Error('The worklist schema or scenario does not match this dashboard');
  if(data.model_version&&data.model_version!==modelVersion(features))throw new Error('The worklist belongs to a different model-data version');
  if(!Array.isArray(data.records)||!data.records.length)throw new Error('The worklist contains no review records');
  if(data.records.length>features.length)throw new Error('The worklist contains too many records');
  const ids=new Map(features.map(f=>[f.properties.block_id,f.properties])),seen=new Set(),changes=[],errors=[];let unchanged=0,keptNotes=0;
  for(let i=0;i<data.records.length;i++){
   const r=data.records[i],label=r?.row?`Row ${r.row}`:`Record ${i+1}`;
   if(!r||typeof r!=='object'){errors.push(`${label}: invalid record`);continue}
   const id=String(r.block_id||'').trim();if(seen.has(id)){errors.push(`${label}: duplicate ID ${id}`);continue}seen.add(id);
   if(!ids.has(id)){errors.push(`${label}: unknown ID ${id||'(blank)'}`);continue}
   const status=options.statusEnglish?options.statusEnglish(String(r.status||'').trim()):String(r.status||'').trim();
   if(!['To inspect','Retain','Defer'].includes(status)){errors.push(`${label}: invalid status for ${id}`);continue}
   if(typeof r.note!=='string'||r.note.length>2000){errors.push(`${label}: note must be text, at most 2000 characters`);continue}
   const old=plan[id]||null;let note=r.note;
   if(!options.replaceBlank&&note.trim()===''&&old?.note){note=old.note;keptNotes++}
   if(old&&old.status===status&&old.note===note){unchanged++;continue}
   changes.push({block_id:id,street_name:ids.get(id).street_name||'Unnamed street segment',old:old?{status:old.status,note:old.note}:null,status,note});
  }
  if(errors.length)throw new Error(errors.slice(0,8).join('\n')+(errors.length>8?`\n… and ${errors.length-8} more errors`:'')+'\nNothing was imported.');
  return {changes,unchanged,keptNotes,added:changes.filter(c=>!c.old).length,updated:changes.filter(c=>c.old).length,legacy:!!data.legacy};
 }
 root.ShadeWorklistImport={SCHEMA,SCENARIO,readXlsx,prepare,modelVersion};
})(typeof window==='undefined'?globalThis:window);

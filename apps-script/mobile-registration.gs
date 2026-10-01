const ROUTES_ID='1wCCkZeA1R_dYFx-k-MYXMY-PUvaW4A9U5oeXQHfm7Ag';
function doPost(e){
  try{
    const p=JSON.parse(e.postData.contents);
    const name=String(p.name||'').trim(), device=String(p.device||''), event=String(p.event||'');
    if(!/^[A-Za-z0-9-]{1,100}$/.test(device)||!/^[A-Za-z0-9-]{1,100}$/.test(event)||!['visit','ping'].includes(p.action))throw Error('invalid');
    const routes=SpreadsheetApp.openById(ROUTES_ID);
    const employee=routes.getSheetByName('EMPLOYEES').getRange('A2:A200').getDisplayValues().flat().find(n=>n.trim().toLowerCase()===name.toLowerCase());
    if(!employee)throw Error('employee');
    let phone='';if(p.action==='visit'){
      const digits=String(p.phone||'').replace(/\D/g,'');
      phone=digits.length===10?'+1'+digits:digits.length===11&&digits[0]==='1'?'+'+digits:'';
      if(!phone)throw Error('phone');
    }
    const lock=LockService.getScriptLock();lock.waitLock(10000);
    try{
      const cache=CacheService.getScriptCache();if(cache.get('ack:'+event))return output_({ok:true});
      const registry=privateRegistry_(routes);
      const sh=registry.getSheetByName('MOBILE USERS');
      const names=sh.getRange(2,1,Math.max(1,sh.getLastRow()-1),1).getDisplayValues().flat();
      let index=names.findIndex(n=>n.trim().toLowerCase()===employee.trim().toLowerCase());let row=index+2;
      const now=new Date();const page=['routes','crew','schedule'].includes(p.page)?p.page:'routes';
      if(index<0){
        if(p.action!=='visit')throw Error('registration_required');
        let last=-1;names.forEach((n,i)=>{if(n.trim())last=i});row=last+3;
        sh.getRange(row,1,1,5).setValues([[employee.trim(),"'"+phone,now,now,1]]);
      }else{
        sh.getRange(row,4).setValue(now);
        if(p.action==='visit'){sh.getRange(row,2).setValue("'"+phone);sh.getRange(row,5).setValue((Number(sh.getRange(row,5).getValue())||0)+1);}
      }
      sh.getRange(row,7,1,2).setValues([[device,page]]);
      sh.getRange(row,3,1,2).setNumberFormat('m/d/yyyy h:mm am/pm');
      const publicSheet=routes.getSheetByName('MOBILE USERS');
      const publicNames=publicSheet.getRange(2,1,Math.max(1,publicSheet.getLastRow()-1),1).getDisplayValues().flat();
      let publicIndex=publicNames.findIndex(n=>n.trim().toLowerCase()===employee.trim().toLowerCase());
      let publicRow=publicIndex+2;
      if(publicIndex<0){let last=-1;publicNames.forEach((n,i)=>{if(n.trim())last=i});publicRow=last+3;publicSheet.getRange(publicRow,1,1,4).setValues([[employee.trim(),sh.getRange(row,3).getValue(),now,sh.getRange(row,5).getValue()]]);}
      else{publicSheet.getRange(publicRow,3,1,2).setValues([[now,sh.getRange(row,5).getValue()]]);}
      publicSheet.getRange(publicRow,6,1,2).setValues([[device,page]]);
      cache.put('ack:'+event,'1',600);
    }finally{lock.releaseLock();}
    return output_({ok:true});
  }catch(err){return output_({ok:false});}
}
function privateRegistry_(routes){
  const props=PropertiesService.getScriptProperties();const id=props.getProperty('PRIVATE_REGISTRY_ID');
  if(id)return SpreadsheetApp.openById(id);
  const registry=SpreadsheetApp.create('Curated Events — Private Mobile User Registry');
  const sh=registry.getSheets()[0];sh.setName('MOBILE USERS');
  sh.getRange('A1:H1').setValues([['EMPLOYEE','PHONE','FIRST VISIT','LAST SEEN','VISITS','STATUS','DEVICE ID','LAST PAGE']]);
  sh.getRange('J1:K2').setValues([['TOTAL USERS','TOTAL VISITS'],['=COUNTA(A2:A)','=SUM(E2:E)']]);
  sh.getRange('A1:H1').setBackground('#0a232d').setFontColor('#ffffff').setFontWeight('bold');sh.setFrozenRows(1);
  sh.setColumnWidth(1,180);sh.setColumnWidth(2,160);sh.setColumnWidths(3,2,185);sh.setColumnWidths(5,2,110);sh.setColumnWidth(7,300);sh.setColumnWidth(8,140);
  sh.getRange('B2:B1000').setNumberFormat('@');sh.getRange('C2:D1000').setNumberFormat('m/d/yyyy h:mm am/pm');
  sh.getRange('F2').setFormula('=ARRAYFORMULA(IF(A2:A="","",IF(D2:D>=NOW()-TIME(0,3,0),"ONLINE","OFFLINE")))');
  registry.setRecalculationInterval(SpreadsheetApp.RecalculationInterval.MINUTE);
  props.setProperty('PRIVATE_REGISTRY_ID',registry.getId());
  routes.getSheetByName('MOBILE USERS SETUP').getRange('A6:B6').setValues([['PRIVATE REGISTRY',registry.getUrl()]]);
  return registry;
}
function doGet(e){
  const p=e&&e.parameter||{};const cb=/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(String(p.callback||''))?p.callback:'';
  if(p.action==='health')return output_({ok:true,service:'curated-registration-v143'},cb);
  const event=String(p.event||'');return output_({ok:p.action==='ack'&&/^[A-Za-z0-9-]{1,100}$/.test(event)&&!!CacheService.getScriptCache().get('ack:'+event)},cb);
}
function output_(obj,cb){return ContentService.createTextOutput(cb?cb+'('+JSON.stringify(obj)+');':JSON.stringify(obj)).setMimeType(cb?ContentService.MimeType.JAVASCRIPT:ContentService.MimeType.JSON);}

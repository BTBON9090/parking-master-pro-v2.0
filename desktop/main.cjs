const {app,BrowserWindow,Menu,shell}=require('electron');
const path=require('node:path');
const externalHosts=new Set(['btbon.cn','www.btbon.cn','xhslink.com','www.xiaohongshu.com','github.com','cdn.btbon.cn','my-portfolio-1317980685.cos.ap-guangzhou.myqcloud.com']);
function openExternal(url){try{const u=new URL(url);if(u.protocol==='https:'&&externalHosts.has(u.hostname))void shell.openExternal(u.href);}catch{}}
function createWindow(){
 const win=new BrowserWindow({width:1440,height:900,minWidth:960,minHeight:600,backgroundColor:'#15222b',title:'停车大师 Pro',autoHideMenuBar:true,
 webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
 win.webContents.setWindowOpenHandler(({url})=>{openExternal(url);return {action:'deny'};});
 win.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('file://')){event.preventDefault();openExternal(url);}});
 win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
 win.loadFile(path.join(__dirname,'../dist/index.html'));
 Menu.setApplicationMenu(Menu.buildFromTemplate([
 ...(process.platform==='darwin'?[{label:app.name,submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'quit'}]}]:[]),
 {label:'窗口',submenu:[{role:'togglefullscreen'},{role:'minimize'},{role:'close'}]},
 {label:'帮助',submenu:[{label:'下载与更新',click:()=>openExternal('https://cdn.btbon.cn/parking-master/index.html')}]}
 ]));
}
app.setName('停车大师 Pro');
app.whenReady().then(()=>{createWindow();app.on('activate',()=>{if(!BrowserWindow.getAllWindows().length)createWindow();});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});

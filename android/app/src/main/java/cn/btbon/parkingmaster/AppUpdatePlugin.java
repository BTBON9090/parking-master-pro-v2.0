package cn.btbon.parkingmaster;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.atomic.AtomicBoolean;

/** User-initiated sideload updates. Only this app's signed, newer APK can be installed. */
@CapacitorPlugin(name="AppUpdate")
public class AppUpdatePlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private volatile boolean cancelled;
    private volatile HttpURLConnection connection;
    private File apk() { return new File(getContext().getCacheDir(), "updates/update.apk"); }
    private android.content.SharedPreferences prefs() { return getContext().getSharedPreferences("app-update", 0); }
    private boolean permitted() { return Build.VERSION.SDK_INT < 26 || getContext().getPackageManager().canRequestPackageInstalls(); }
    private void progress(String stage, long received, long total) {
        JSObject value = new JSObject(); value.put("stage", stage); value.put("received", received); value.put("total", total);
        notifyListeners("progress", value);
    }
    private void clear() { apk().delete(); prefs().edit().clear().apply(); }
    private static String hex(byte[] bytes) {
        StringBuilder out=new StringBuilder(); for(byte b:bytes)out.append(String.format("%02x",b&255)); return out.toString();
    }
    private URL trustedUrl(String address, String version) throws Exception {
        URI u=new URI(address);
        String expected="/parking-master/releases/"+version+"/Parking-Master-Pro-"+version+"-android.apk";
        if(!"https".equals(u.getScheme()) || u.getUserInfo()!=null || u.getPort()!=-1 || u.getQuery()!=null || u.getFragment()!=null
            || !expected.equals(u.getRawPath()) || !("cdn.btbon.cn".equals(u.getHost()) || "my-portfolio-1317980685.cos.ap-guangzhou.myqcloud.com".equals(u.getHost())))
            throw new IOException("更新地址不受信任");
        return u.toURL();
    }
    @PluginMethod public void status(PluginCall call) {
        JSObject result=new JSObject();result.put("ready",apk().isFile()&&prefs().contains("sha256"));result.put("busy",busy.get());result.put("permission",permitted());result.put("version",prefs().getString("version",""));call.resolve(result);
    }
    @PluginMethod public void download(PluginCall call) {
        String address=call.getString("url",""), version=call.getString("version",""), sha=call.getString("sha256","");
        long size=call.getInt("size",0);
        if(!version.matches("[0-9]+\\.[0-9]+\\.[0-9]+") || !sha.matches("[a-fA-F0-9]{64}") || size<1024 || size>250L*1024*1024) {call.reject("更新信息不完整，请重试检查更新");return;}
        final URL url;
        try {url=trustedUrl(address,version);}catch(Exception e){call.reject(e.getMessage());return;}
        if(!busy.compareAndSet(false,true)){call.reject("已有下载或校验正在进行");return;}
        cancelled=false;
        worker.execute(()->{
            File partial=new File(apk().getParentFile(),"update.part");String failure=null;
            try {
                apk().getParentFile().mkdirs();clear();partial.delete();
                connection=(HttpURLConnection)url.openConnection();connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(15000);connection.setReadTimeout(15000);connection.setRequestProperty("Accept-Encoding","identity");
                if(connection.getResponseCode()!=200)throw new IOException("下载失败，请重新检查更新");
                long length=connection.getContentLengthLong();if(length>0&&length!=size)throw new IOException("安装包大小与版本信息不符");
                MessageDigest digest=MessageDigest.getInstance("SHA-256");long received=0,last=0;
                try(InputStream in=connection.getInputStream();FileOutputStream out=new FileOutputStream(partial)) {
                    byte[] buffer=new byte[65536];int n;
                    while((n=in.read(buffer))!=-1){
                        if(cancelled)throw new IOException("已取消下载");
                        received+=n;if(received>size)throw new IOException("安装包大小异常");
                        digest.update(buffer,0,n);out.write(buffer,0,n);
                        long now=System.currentTimeMillis();if(now-last>200){progress("download",received,size);last=now;}
                    }
                    out.getFD().sync();
                }
                if(cancelled)throw new IOException("已取消下载");
                if(received!=size||!hex(digest.digest()).equalsIgnoreCase(sha))throw new IOException("安装包校验失败，未安装，请重试");
                progress("verify",received,size);verifyPackage(partial,version);
                if(cancelled)throw new IOException("已取消下载");
                if(!partial.renameTo(apk()))throw new IOException("无法保存安装包，请检查存储空间");
                prefs().edit().putString("sha256",sha.toLowerCase()).putString("version",version).putLong("size",size).commit();

            } catch(Exception e) {partial.delete();clear();failure=cancelled?"已取消下载":e.getMessage();}
            finally {if(connection!=null)connection.disconnect();connection=null;busy.set(false);}
            if(failure!=null)call.reject(failure);else{JSObject result=new JSObject();result.put("ready",true);call.resolve(result);progress("ready",size,size);}
        });
    }
    @SuppressWarnings("deprecation") private void verifyPackage(File file,String version) throws Exception {
        PackageManager pm=getContext().getPackageManager();
        int flags=Build.VERSION.SDK_INT>=28?PackageManager.GET_SIGNING_CERTIFICATES:PackageManager.GET_SIGNATURES;
        PackageInfo next=pm.getPackageArchiveInfo(file.getAbsolutePath(),flags), current=pm.getPackageInfo(getContext().getPackageName(),flags);
        if(next==null||!current.packageName.equals(next.packageName)||!version.equals(next.versionName))throw new IOException("安装包应用或版本不匹配");
        long nextCode=Build.VERSION.SDK_INT>=28?next.getLongVersionCode():next.versionCode, currentCode=Build.VERSION.SDK_INT>=28?current.getLongVersionCode():current.versionCode;
        if(nextCode<=currentCode)throw new IOException("安装包不是更新版本");
        Signature[] ns=Build.VERSION.SDK_INT>=28?next.signingInfo.getApkContentsSigners():next.signatures;
        Signature[] cs=Build.VERSION.SDK_INT>=28?current.signingInfo.getApkContentsSigners():current.signatures;
        if(ns==null||cs==null||ns.length!=cs.length)throw new IOException("应用签名不匹配");
        for(Signature signature:cs)if(!Arrays.asList(ns).contains(signature))throw new IOException("应用签名不匹配");
    }
    @PluginMethod public void cancel(PluginCall call) {
        cancelled=true;if(connection!=null)connection.disconnect();if(!busy.get())clear();call.resolve();
    }
    @PluginMethod public void install(PluginCall call) {
        if(!apk().isFile()||!prefs().contains("sha256")){call.reject("请先下载更新");return;}
        if(!permitted()) {
            try {getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+getContext().getPackageName())));
                JSObject r=new JSObject();r.put("permissionRequired",true);call.resolve(r);
            }catch(Exception e){call.reject("请在系统设置中允许此应用安装更新后重试");}return;
        }
        if(!busy.compareAndSet(false,true)){call.reject("正在处理安装包，请稍后重试");return;}
        worker.execute(()->{
            try {
                MessageDigest digest=MessageDigest.getInstance("SHA-256");
                try(InputStream in=new FileInputStream(apk())){byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)digest.update(b,0,n);}
                if(!hex(digest.digest()).equals(prefs().getString("sha256",""))||apk().length()!=prefs().getLong("size",0))throw new IOException("安装包校验失败，请重新下载");
                verifyPackage(apk(),prefs().getString("version",""));
                Uri uri=FileProvider.getUriForFile(getContext(),getContext().getPackageName()+".fileprovider",apk());
                Intent intent=new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getActivity().runOnUiThread(()->{
                    try {getActivity().startActivity(intent);JSObject r=new JSObject();r.put("installerOpened",true);call.resolve(r);}
                    catch(Exception e){call.reject("系统安装器无法打开，请使用下载页面");}
                    finally {busy.set(false);}
                });
            }catch(Exception e){clear();busy.set(false);call.reject(e.getMessage());}
        });
    }
    @Override protected void handleOnDestroy() {cancelled=true;if(connection!=null)connection.disconnect();worker.shutdown();}
}

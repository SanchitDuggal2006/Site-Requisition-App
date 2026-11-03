package PACKAGE_NAME;

import android.os.Bundle;
import android.graphics.Color;
import android.net.Uri;
import android.content.Intent;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebView;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebResourceResponse;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.FrameLayout;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
 private LinearLayout offline;
 private String origin;
 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  origin=getBridge().getConfig().getServerUrl();
  getWindow().setStatusBarColor(Color.rgb(246,247,249));
  android.content.pm.PackageInfo webViewPackage = WebView.getCurrentWebViewPackage();
  int webViewVersion = 0;
  try { webViewVersion = Integer.parseInt(webViewPackage.versionName.split("\\.")[0]); } catch (Exception ignored) {}
  if (webViewVersion < 108) {
   getBridge().getWebView().stopLoading();
   LinearLayout update = new LinearLayout(this);update.setOrientation(LinearLayout.VERTICAL);update.setGravity(Gravity.CENTER);update.setPadding(40,40,40,40);update.setBackgroundColor(Color.rgb(246,247,249));
   TextView notice = new TextView(this);notice.setText("Update Android System WebView and Chrome in the Play Store, then reopen Redpeach SiteOps.");notice.setTextSize(20);notice.setTextColor(Color.rgb(23,35,29));update.addView(notice);
   Button openStore = new Button(this);openStore.setText("Open Play Store");openStore.setOnClickListener(v->{try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://play.google.com/store/apps/details?id=com.google.android.webview")));}catch(Exception ignored){}});update.addView(openStore);
   addContentView(update,new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,FrameLayout.LayoutParams.MATCH_PARENT));
   return;
  }
  offline=new LinearLayout(this);offline.setOrientation(LinearLayout.VERTICAL);offline.setGravity(Gravity.CENTER);offline.setPadding(40,40,40,40);offline.setBackgroundColor(Color.rgb(246,247,249));offline.setVisibility(View.GONE);
  TextView message=new TextView(this);message.setText("No connection. Try again");message.setTextSize(20);message.setTextColor(Color.rgb(23,35,29));offline.addView(message);
  Button retry=new Button(this);retry.setText("Retry");retry.setOnClickListener(v->{offline.setVisibility(View.GONE);getBridge().getWebView().loadUrl(origin);});offline.addView(retry);
  addContentView(offline,new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT,FrameLayout.LayoutParams.MATCH_PARENT));
  getBridge().getWebView().setWebViewClient(new BridgeWebViewClient(getBridge()) {
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request) {
    Uri target=request.getUrl(),home=Uri.parse(origin);
    if(target.getScheme().equals("https")&&home.getHost().equals(target.getHost())&&home.getPort()==target.getPort())return super.shouldOverrideUrlLoading(view,request);
    if(target.getScheme().equals("https")||target.getScheme().equals("http")){try{startActivity(new Intent(Intent.ACTION_VIEW,target));}catch(Exception ignored){}}
    return true;
   }
   @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){if(request.isForMainFrame())runOnUiThread(()->offline.setVisibility(View.VISIBLE));}
   @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response){if(request.isForMainFrame()&&response.getStatusCode()>=400)runOnUiThread(()->offline.setVisibility(View.VISIBLE));}
  });
 }
}

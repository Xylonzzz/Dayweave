using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

static class DesktopRunner {
 public static readonly string Root=AppDomain.CurrentDomain.BaseDirectory;
 static string Quote(string value) {var b=new StringBuilder("\"");int slashes=0;foreach(char c in value){if(c=='\\'){slashes++;continue;}if(c=='"'){b.Append('\\',slashes*2+1);b.Append(c);}else{b.Append('\\',slashes);b.Append(c);}slashes=0;}b.Append('\\',slashes*2);return b.Append('"').ToString();}
 public static async Task<Dictionary<string,object>> Run(string action,string argument=null) {
  var start=new ProcessStartInfo(Path.Combine(Root,"runtime","node.exe"),Quote(Path.Combine(Root,"desktop","bootstrap.mjs"))+" "+action+(argument==null?"":" "+Quote(argument)));
  start.WorkingDirectory=Root;start.UseShellExecute=false;start.CreateNoWindow=true;start.RedirectStandardOutput=true;start.RedirectStandardError=true;start.StandardOutputEncoding=Encoding.UTF8;start.StandardErrorEncoding=Encoding.UTF8;
  using(var process=Process.Start(start)) {
   var output=process.StandardOutput.ReadToEndAsync();var errors=process.StandardError.ReadToEndAsync();await Task.Run(()=>process.WaitForExit());
   var text=await output;var error=await errors;Dictionary<string,object> result;
   try {result=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(text.Trim());} catch {throw new Exception("桌面运行环境未能启动。"+error);}
   if(result.ContainsKey("error"))throw new Exception(Convert.ToString(result["error"]));return result;
  }
 }
 public static bool Running(Dictionary<string,object> state){return state.ContainsKey("running")&&(bool)state["running"];}
 public static void Open(string value){Process.Start(new ProcessStartInfo(value){UseShellExecute=true});}
 [STAThread] public static void Main(string[] args){
  Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  if(args.Length==2&&args[0]=="--self-test") {
   try {var state=Run("start").GetAwaiter().GetResult();if(!Running(state))throw new Exception("start failed");state=Run("status").GetAwaiter().GetResult();if(!Running(state))throw new Exception("status failed");Run("stop").GetAwaiter().GetResult();if(Running(Run("status").GetAwaiter().GetResult()))throw new Exception("stop failed");File.WriteAllText(args[1],"PASS: packaged EXE started, identified and stopped its own bundled service.");}catch(Exception error){File.WriteAllText(args[1],"FAIL: "+error.ToString());Environment.ExitCode=1;}return;
  }
  if(args.Length==2&&args[0]=="--ui-test") {using(var form=new Launcher(false)){form.Show();Application.DoEvents();using(var bitmap=new Bitmap(form.Width,form.Height)){form.DrawToBitmap(bitmap,new Rectangle(Point.Empty,form.Size));bitmap.Save(args[1]);}}return;}
  bool created;using(var mutex=new Mutex(true,"Local\\ShixuDesktopLauncher",out created)) {
   if(!created){try{var state=Run("existing").GetAwaiter().GetResult();if(!Running(state))state=Run("status").GetAwaiter().GetResult();if(Running(state))Open(Convert.ToString(state["url"]));else MessageBox.Show("时序正在准备，请稍等片刻。","时序");}catch(Exception error){MessageBox.Show(error.Message,"时序");}return;}
   Application.Run(new Launcher(true));
  }
 }
}

class Launcher:Form {
 readonly Label status=new Label();readonly Label note=new Label();readonly List<Button> buttons=new List<Button>();string currentURL="http://localhost:3090";bool busy;
 public Launcher(bool automatic) {
  Text="时序 · 桌面启动器";ClientSize=new Size(610,415);MinimumSize=MaximumSize=new Size(626,454);StartPosition=FormStartPosition.CenterScreen;BackColor=Color.FromArgb(247,248,244);Font=new Font("Microsoft YaHei UI",10);FormBorderStyle=FormBorderStyle.FixedSingle;MaximizeBox=false;
  try{Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);}catch{}
  var title=new Label{Text="让每一天，有自己的节奏。",Location=new Point(28,28),Size=new Size(550,42),Font=new Font(Font.FontFamily,20,FontStyle.Bold),ForeColor=Color.FromArgb(35,64,53)};Controls.Add(title);
  status.Text="准备就绪。日常使用无需另装 Node 或 Docker。";status.Location=new Point(30,86);status.Size=new Size(550,64);Controls.Add(status);
  Add("打开时序",30,160,()=>OpenDefault());Add("启动桌面独立空间",310,160,()=>OpenDesktop());
  Add("AI 定制与运行版本",30,213,async()=>{await Ensure();DesktopRunner.Open(currentURL+"/#customize");});
  Add("打开数据文件夹",310,213,async()=>{var s=await DesktopRunner.Run("status");DesktopRunner.Open(Convert.ToString(s["home"]));});
  Add("复制首次登录信息",30,266,async()=>{var s=await DesktopRunner.Run("credentials");Clipboard.SetText(Convert.ToString(s["text"]));status.Text="登录信息已复制。导入旧备份后请使用原账号密码。";});
  Add("停止桌面后台服务",310,266,async()=>{await DesktopRunner.Run("stop");status.Text="桌面空间已停止。原来的时序服务不受影响。";});
  Add("首次导入旧版完整备份",30,319,async()=>{using(var dialog=new FolderBrowserDialog{Description="选择包含 planner.sqlite 和 secret.key 的完整备份文件夹。只导入空白桌面空间，不覆盖已有数据。"}){if(dialog.ShowDialog(this)!=DialogResult.OK)return;var s=await DesktopRunner.Run("import",dialog.SelectedPath);status.Text=Convert.ToString(s["message"]);}});
  note.Text="关闭此窗口不会停止后台日程服务。新版本不会自动覆盖已有定制源码。";note.ForeColor=Color.DimGray;note.Location=new Point(30,379);note.Size=new Size(550,26);Controls.Add(note);
  FormClosing+=(s,e)=>{if(busy){e.Cancel=true;status.Text="正在处理当前操作，请完成后再关闭窗口。";}};
  if(automatic)Shown+=async(s,e)=>await Execute(async()=>{var old=await DesktopRunner.Run("existing");var own=await DesktopRunner.Run("status");if(DesktopRunner.Running(old)||DesktopRunner.Running(own))await OpenDefault();else status.Text="首次使用：可先导入旧版完整备份，或点击“打开时序”创建空白空间。\n原版浏览器里的离线数据仍留在原网址中。";});
 }
 void Add(string text,int x,int y,Func<Task> action){var button=new Button{Text=text,Location=new Point(x,y),Size=new Size(260,40),FlatStyle=FlatStyle.Flat,BackColor=Color.White};button.FlatAppearance.BorderColor=Color.FromArgb(215,222,214);button.Click+=async(s,e)=>await Execute(action);buttons.Add(button);Controls.Add(button);}
 async Task Execute(Func<Task> action){if(busy)return;busy=true;foreach(var b in buttons)b.Enabled=false;status.Text="正在准备，请稍候。首次启动需要复制运行文件…";try{await action();}catch(Exception error){status.Text=error.Message;MessageBox.Show(this,error.Message,"时序",MessageBoxButtons.OK,MessageBoxIcon.Information);}finally{busy=false;foreach(var b in buttons)b.Enabled=true;}}
 async Task Ensure(){var old=await DesktopRunner.Run("existing");if(DesktopRunner.Running(old)){currentURL=Convert.ToString(old["url"]);return;}var state=await DesktopRunner.Run("start");currentURL=Convert.ToString(state["url"]);}
 async Task OpenDefault(){await Ensure();DesktopRunner.Open(currentURL);status.Text=currentURL.EndsWith(":3088")?"已打开原来的时序服务，继续使用原有数据。\n如需使用独立安装包，点击“启动桌面独立空间”。":"桌面空间已启动，浏览器已打开。\n新空间请点击“复制首次登录信息”。";}
 async Task OpenDesktop(){var state=await DesktopRunner.Run("start");currentURL=Convert.ToString(state["url"]);DesktopRunner.Open(currentURL);status.Text="独立桌面空间已启动。数据单独保存，原来的时序不受影响。";}
}

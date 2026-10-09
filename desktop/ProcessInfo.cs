using System;
using System.Diagnostics;
using System.Globalization;
using System.Management;
using System.Text;
using System.Web.Script.Serialization;

internal static class ProcessInfo {
    static int Main(string[] args) {
        Console.OutputEncoding = new UTF8Encoding(false);
        int pid;
        if (args.Length < 1 || !Int32.TryParse(args[0], out pid) || pid < 1) return 2;
        try {
            using (Process process = Process.GetProcessById(pid)) {
                // Existing WMI lock records have microsecond precision.
                long ticks = process.StartTime.ToUniversalTime().Ticks;
                string command = null;
                if (args.Length > 1 && args[1] == "--command") {
                    using (ManagementObjectSearcher query = new ManagementObjectSearcher(
                        "SELECT CommandLine FROM Win32_Process WHERE ProcessId=" + pid.ToString(CultureInfo.InvariantCulture))) {
                        using (ManagementObjectCollection results = query.Get()) {
                            foreach (ManagementObject result in results) {
                                using (result) { command = result["CommandLine"] as string; }
                            }
                        }
                    }
                }
                Console.WriteLine(new JavaScriptSerializer().Serialize(new {
                    started = (ticks - ticks % 10).ToString(CultureInfo.InvariantCulture), command = command
                }));
            }
            return 0;
        } catch (ArgumentException) {
            Console.WriteLine("null");
            return 0;
        } catch (Exception error) {
            Console.Error.WriteLine(error.Message);
            return 1;
        }
    }
}

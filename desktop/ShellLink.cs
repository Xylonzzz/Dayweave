using System;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Text;

namespace Dayweave {
    // Use the Unicode Shell interface, independent of the Windows ANSI code page.
    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    internal class ShellLinkObject { }

    [ComImport, Guid("000214F9-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    internal interface IShellLinkW {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int size, IntPtr findData, uint flags);
        void GetIDList(out IntPtr list);
        void SetIDList(IntPtr list);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder text, int size);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string text);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int size);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string path);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder text, int size);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string text);
        void GetHotkey(out short key);
        void SetHotkey(short key);
        void GetShowCmd(out int command);
        void SetShowCmd(int command);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder path, int size, out int index);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string path, int index);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string path, uint reserved);
        void Resolve(IntPtr window, uint flags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string path);
    }

    public static class ShellLink {
        public static void Create(string shortcut, string target, string directory) {
            object instance = new ShellLinkObject();
            try {
                IShellLinkW link = (IShellLinkW)instance;
                link.SetPath(target);
                link.SetWorkingDirectory(directory);
                link.SetIconLocation(target, 0);
                ((IPersistFile)instance).Save(shortcut, true);
            } finally { Marshal.FinalReleaseComObject(instance); }
        }

        public static string Target(string shortcut) {
            object instance = new ShellLinkObject();
            try {
                ((IPersistFile)instance).Load(shortcut, 0);
                StringBuilder path = new StringBuilder(32768);
                ((IShellLinkW)instance).GetPath(path, path.Capacity, IntPtr.Zero, 4);
                return path.ToString();
            } finally { Marshal.FinalReleaseComObject(instance); }
        }
    }
}

param(
  [Parameter(Mandatory=$true)][string]$FilePath,
  [Parameter(Mandatory=$true)][string]$PrinterName
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class RawPrint
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DOCINFOW
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int Level, ref DOCINFOW pDocInfo);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", SetLastError = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    public static bool Send(string printerName, byte[] data)
    {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
            return false;

        var docInfo = new DOCINFOW
        {
            pDocName = "TSPL Label",
            pOutputFile = null,
            pDataType = "RAW"
        };

        if (!StartDocPrinter(hPrinter, 1, ref docInfo))
        {
            ClosePrinter(hPrinter);
            return false;
        }

        StartPagePrinter(hPrinter);

        int bytesWritten;
        bool success = WritePrinter(hPrinter, data, data.Length, out bytesWritten);

        EndPagePrinter(hPrinter);
        EndDocPrinter(hPrinter);
        ClosePrinter(hPrinter);

        return success;
    }
}
"@

$data = [System.IO.File]::ReadAllBytes($FilePath)
$result = [RawPrint]::Send($PrinterName, $data)

if ($result) {
    Write-Host "OK"
    exit 0
} else {
    Write-Host "FALHOU"
    exit 1
}

Function Get-MatchingFiles
{
    [CmdletBinding()]
    param(
        [string] $Pattern,
        [string] $Root
    )
    
    if ($Pattern.Contains("*") -or $Pattern.Contains("?"))
    {
        $matchingFiles = Find-Files -SearchPattern $Pattern -Root $Root
        if (!$matchingFiles.Count)
        {
            throw "Target files not found using search pattern '${Pattern}'."
        }
    }
    elseif ($Pattern.Contains(';'))
    {
        $matchingFiles = ($Pattern -split ';')
    }
    else    
    {
        $matchingFiles = ,$Pattern
    }

    $matchingFiles
}

Function Get-FileEncoding
{
    [CmdletBinding()]
    param(
        [string] $Path
    )
    
    $bytes = [byte[]](Get-content -Path $Path -Encoding Byte -ReadCount 4 -TotalCount 4)
    if ($bytes[0] -eq 0x2b -and $bytes[1] -eq 0x2f -and $bytes[2] -eq 0x76 -and ($bytes[3] -eq 0x38 -or $bytes[3] -eq 0x39 -or $bytes[3] -eq 0x2b -or $bytes[3] -eq 0x2f))
    {
        return 'UTF7'
    }
    
    if ($Bytes[0] -eq 0xef -and $Bytes[1] -eq 0xbb -and $Bytes[2] -eq 0xbf)
    {
        return 'UTF8'
    }
    
    if ($bytes[0] -eq 0xfe -and $bytes[1] -eq 0xff)
    {
        return 'BigEndianUnicode'
    }
    
    if ($bytes[0] -eq 0xff -and $bytes[1] -eq 0xfe)
    {
        return 'Unicode'
    }
    
    if ($bytes[0] -eq 0 -and $bytes[1] -eq 0 -and $bytes[2] -eq 0xfe -and $bytes[3] -eq 0xff)
    {
        return 'BigEndianUTF32'
    }

    if ($bytes[0] -eq 0xfe -and $bytes[1] -eq 0xff -and $bytes[2] -eq 0 -and $bytes[3] -eq 0)
    {
        return 'UTF32'
    }

    'Ascii'
}

Function Set-Variables
{
    [CmdletBinding()]
    param(
        [string] $Path,
        [regex] $Regex,
        [string] $Encoding,
        [switch] $FailOnMissing,
        [switch] $writeBom
    )
    
    Write-Host "Replacing tokens in file '${Path}'..."
    
    $content = [System.IO.File]::ReadAllText($Path)
    $replaceCallback = {
        param(
            [System.Text.RegularExpressions.Match] $Match
        )
        
        $value = Get-TaskVariable $distributedTaskContext $Match.Groups[1].Value
        if (!$value)
        {
            if ($FailOnMissing)
            {
                Write-Error "Variable '$($Match.Groups[1].Value)' not found."
            }
            else
            {
                Write-Warning "Variable '$($Match.Groups[1].Value)' not found."   
            }
        }
        
        Write-Verbose "Replacing '$($Match.Value)' with '${value}'"
        $value
    }
    
    $content = $regex.Replace($content, $replaceCallback)
    
    if (!$Encoding -or $Encoding -eq "auto")
    {
        $Encoding = Get-FileEncoding -Path $Path
    }

    switch ($Encoding)
    {
        "ascii"
        {
            $Encoding = New-Object System.Text.ASCIIEncoding
        }
        "utf7"
        {
            $Encoding = New-Object System.Text.UTF7Encoding($writeBom)
        }
        "utf8"
        {
            $Encoding = New-Object System.Text.UTF8Encoding($writeBom)
        }
        "unicode"
        {
            $Encoding = New-Object System.Text.UnicodeEncoding($writeBom)
        }
        "BigEndianUnicode"
        {
            $Encoding = New-Object System.Text.UnicodeEncoding($true, $writeBom)
        }
        "utf32"
        {
            $Encoding = New-Object System.Text.UTF32Encoding($writeBom)
        }
        "BigEndianUTF32"
        {
            $Encoding = New-Object System.Text.UTF32Encoding($rue, $writeBom)
        }
    }

    Write-Verbose "Using encoding '${Encoding}'"
    [System.IO.File]::WriteAllText($Path, $content, $Encoding)
}
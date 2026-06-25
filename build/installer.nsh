!macro customInstall
  IfSilent skipQuestion
  MessageBox MB_YESNO|MB_ICONQUESTION "Sale Button automatisch starten bij het opstarten van Windows?" IDYES enableStartup IDNO disableStartup

  enableStartup:
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Sale Button" '$\"$INSTDIR\SaleButton.exe$\"'
    Goto done

  disableStartup:
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Sale Button"
    Goto done

  skipQuestion:
    ; Voor stille installs slaan we de vraag over en laten we de huidige instelling staan.

  done:
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Sale Button"
!macroend

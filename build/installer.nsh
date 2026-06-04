; installer.nsh – custom NSIS script for Benna Business Manager

!macro customInit
  ; This runs before the installer starts.
!macroend

!macro customInstall
  ; This runs after files are written during installation.
!macroend

!macro customUnInstall
  ; This runs during uninstallation.
  ; Clean up the installation directory without failing if files are locked.
  RMDir /r "$INSTDIR"
!macroend

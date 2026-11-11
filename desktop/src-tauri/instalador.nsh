; Menu do botão direito (como no WinRAR): "Extrair com o Vindex…" e "Extrair aqui (Vindex)".
; Instalação por usuário: grava em HKCU, sem pedir administrador. No Windows 11 aparece em "Mostrar mais opções".
!macro VINDEX_MENU EXT
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\VindexExtrair" "" "Extrair com o Vindex…"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\VindexExtrair" "Icon" "$INSTDIR\${MAINBINARYNAME}.exe"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\VindexExtrair\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" --extrair "%1"'
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\VindexExtrairAqui" "" "Extrair aqui (Vindex)"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\VindexExtrairAqui" "Icon" "$INSTDIR\${MAINBINARYNAME}.exe"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\VindexExtrairAqui\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" --extrair-aqui "%1"'
!macroend

!macro VINDEX_MENU_FIM EXT
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\VindexExtrair"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\VindexExtrairAqui"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro VINDEX_MENU ".zip"
  !insertmacro VINDEX_MENU ".tar"
  !insertmacro VINDEX_MENU ".gz"
  !insertmacro VINDEX_MENU ".tgz"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro VINDEX_MENU_FIM ".zip"
  !insertmacro VINDEX_MENU_FIM ".tar"
  !insertmacro VINDEX_MENU_FIM ".gz"
  !insertmacro VINDEX_MENU_FIM ".tgz"
!macroend

; Keep native NSIS controls readable while using My Novella's warm palette.
!define MUI_BGCOLOR "FAFAFA"
!define MUI_TEXTCOLOR "171717"
!define MUI_DIRECTORYPAGE_BGCOLOR "FFFFFF"
!define MUI_DIRECTORYPAGE_TEXTCOLOR "171717"
!define MUI_INSTFILESPAGE_COLORS "171717 FFFFFF"
!define MUI_FINISHPAGE_LINK_COLOR "D6A354"

!macro customHeader
  ShowInstDetails show
  ShowUninstDetails show
!macroend

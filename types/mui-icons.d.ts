// Fallback declaration for icons missing upstream .d.ts (e.g. @mui/icons-material/Edit)
declare module "@mui/icons-material/Edit" {
  import * as React from "react";
  import { SvgIconProps } from "@mui/material/SvgIcon";

  const Icon: React.FC<SvgIconProps>;
  export default Icon;
}

declare module "@mui/icons-material/FirstPage" {
  import * as React from "react";
  import { SvgIconProps } from "@mui/material/SvgIcon";
  const Icon: React.FC<SvgIconProps>;
  export default Icon;
}

declare module "@mui/icons-material/LastPage" {
  import * as React from "react";
  import { SvgIconProps } from "@mui/material/SvgIcon";
  const Icon: React.FC<SvgIconProps>;
  export default Icon;
}

declare module "@mui/icons-material/NavigateBefore" {
  import * as React from "react";
  import { SvgIconProps } from "@mui/material/SvgIcon";
  const Icon: React.FC<SvgIconProps>;
  export default Icon;
}

declare module "@mui/icons-material/NavigateNext" {
  import * as React from "react";
  import { SvgIconProps } from "@mui/material/SvgIcon";
  const Icon: React.FC<SvgIconProps>;
  export default Icon;
}

declare module "@mui/icons-material/Share" {
  import * as React from "react";
  import { SvgIconProps } from "@mui/material/SvgIcon";
  const Icon: React.FC<SvgIconProps>;
  export default Icon;
}

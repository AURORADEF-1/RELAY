export type DymoPrinter = {
  name: string;
  modelName?: string;
  printerType?: string;
  isConnected?: boolean;
  isLocal?: boolean;
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function normalizeDymoPrinters(value: unknown): DymoPrinter[] {
  if (Array.isArray(value)) {
    return value.filter((printer): printer is DymoPrinter => (
      typeof printer === "object"
      && printer !== null
      && typeof (printer as DymoPrinter).name === "string"
    ));
  }

  if (typeof value === "object" && value !== null) {
    const byIndex = (value as { byIndex?: unknown }).byIndex;
    if (Array.isArray(byIndex)) {
      return normalizeDymoPrinters(byIndex);
    }
  }

  return [];
}

export function selectDymoLabelWriter(
  printers: DymoPrinter[],
  configuredPrinterName?: string | null,
) {
  const configuredName = configuredPrinterName?.trim().toLowerCase();
  if (configuredName) {
    const configured = printers.find((printer) => printer.name.trim().toLowerCase() === configuredName);
    if (configured?.isConnected !== false) {
      return configured;
    }
  }

  const connectedLabelWriters = printers.filter((printer) => (
    printer.isConnected !== false
    && (
      printer.printerType === "LabelWriterPrinter"
      || /labelwriter/i.test(`${printer.name} ${printer.modelName ?? ""}`)
    )
  ));

  return connectedLabelWriters.find((printer) => /\b550\b/i.test(`${printer.name} ${printer.modelName ?? ""}`))
    ?? connectedLabelWriters[0]
    ?? null;
}

export type DymoJobLabelContent = {
  barcodeValue: string;
  jobNumber: string;
  requestedBy?: string | null;
  readyAt?: string | null;
  partNumber?: string | null;
  partDescription?: string | null;
  unitIndex?: number;
  unitTotal?: number;
  binLocation?: string | null;
};

export function formatDymoReadyAt(value?: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(",", " ·");
}

export function buildDymoJobLabelXml(
  content: string | DymoJobLabelContent,
  consumableName = "Large Address Labels",
) {
  const normalizedContent: DymoJobLabelContent = typeof content === "string"
    ? { barcodeValue: content, jobNumber: content }
    : content;
  const safeBarcodeValue = escapeXml(normalizedContent.barcodeValue.trim() || "TBC");
  const safeJobNumber = escapeXml(normalizedContent.jobNumber.trim() || "TBC");
  const safeRequestedBy = escapeXml(normalizedContent.requestedBy?.trim() || "Not recorded");
  const safeReadyAt = escapeXml(formatDymoReadyAt(normalizedContent.readyAt));
  const safeConsumableName = escapeXml(consumableName.trim() || "Large Address Labels");

  return `<?xml version="1.0" encoding="utf-8"?>
<DesktopLabel Version="1">
  <DYMOLabel Version="3">
    <Description>RELAY ready job barcode</Description>
    <Orientation>Landscape</Orientation>
    <LabelName>${safeConsumableName}</LabelName>
    <InitialLength>0</InitialLength>
    <BorderStyle>SolidLine</BorderStyle>
    <DYMORect>
      <DYMOPoint><X>0.23</X><Y>0.06</Y></DYMOPoint>
      <Size><Width>3.21</Width><Height>1.286</Height></Size>
    </DYMORect>
    <BorderColor><SolidColorBrush><Color A="1" R="0" G="0" B="0" /></SolidColorBrush></BorderColor>
    <BorderThickness>1</BorderThickness>
    <Show_Border>False</Show_Border>
    <DynamicLayoutManager>
      <RotationBehavior>ClearObjects</RotationBehavior>
      <LabelObjects>
        ${buildAddressObject("RELAY_HEADER", "RELAY", 0.3, 0.08, 1.1, 0.18, 9, true, "Left")}
        ${buildAddressObject("READY_HEADER", "PARTS READY", 2.2, 0.08, 0.95, 0.18, 9, true, "Right")}
        ${buildAddressObject("JOB_CAPTION", "JOB NUMBER", 0.3, 0.31, 0.9, 0.14, 7, true, "Left")}
        ${buildAddressObject("JOB_NUMBER_TEXT", safeJobNumber, 0.3, 0.44, 1.05, 0.33, 22, true, "Left")}
        ${buildAddressObject("REQUESTED_BY_CAPTION", "REQUESTED BY", 1.48, 0.31, 0.8, 0.14, 7, true, "Left")}
        ${buildAddressObject("REQUESTED_BY_TEXT", safeRequestedBy, 1.48, 0.46, 0.8, 0.27, 10, true, "Left")}
        ${buildAddressObject("READY_AT_CAPTION", "READY AT", 2.36, 0.31, 0.79, 0.14, 7, true, "Left")}
        ${buildAddressObject("READY_AT_TEXT", safeReadyAt, 2.36, 0.46, 0.79, 0.27, 9, true, "Left")}
        <BarcodeObject>
          <Name>JOB_NUMBER_BARCODE</Name>
          <Brushes>
            <BackgroundBrush><SolidColorBrush><Color A="0" R="0" G="0" B="0" /></SolidColorBrush></BackgroundBrush>
            <BorderBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0" /></SolidColorBrush></BorderBrush>
            <StrokeBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0" /></SolidColorBrush></StrokeBrush>
            <FillBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0" /></SolidColorBrush></FillBrush>
          </Brushes>
          <Rotation>Rotation0</Rotation>
          <OutlineThickness>1</OutlineThickness>
          <IsOutlined>False</IsOutlined>
          <BorderStyle>SolidLine</BorderStyle>
          <Margin><DYMOThickness Left="0" Top="0" Right="0" Bottom="0" /></Margin>
          <BarcodeFormat>Code39</BarcodeFormat>
          <Data><MultiDataString><DataString>${safeBarcodeValue}</DataString></MultiDataString></Data>
          <HorizontalAlignment>Center</HorizontalAlignment>
          <VerticalAlignment>Middle</VerticalAlignment>
          <Size>Small</Size>
          <TextPosition>None</TextPosition>
          <FontInfo>
            <FontName>Arial</FontName>
            <FontSize>12</FontSize>
            <IsBold>True</IsBold>
            <IsItalic>False</IsItalic>
            <IsUnderline>False</IsUnderline>
            <FontBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0" /></SolidColorBrush></FontBrush>
          </FontInfo>
          <ObjectLayout>
            <DYMOPoint><X>0.3</X><Y>0.84</Y></DYMOPoint>
            <Size><Width>2.28</Width><Height>0.31</Height></Size>
          </ObjectLayout>
        </BarcodeObject>
        ${buildAddressObject("BARCODE_JOB_TEXT", safeJobNumber, 2.66, 0.84, 0.49, 0.31, 12, true, "Center")}
      </LabelObjects>
    </DynamicLayoutManager>
  </DYMOLabel>
  <LabelApplication>Blank</LabelApplication>
  <DataTable><Columns></Columns><Rows></Rows></DataTable>
</DesktopLabel>`;
}

function buildAddressObject(
  name: string,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  isBold: boolean,
  alignment: "Left" | "Center" | "Right",
) {
  return `<AddressObject>
          <Name>${name}</Name>
          <Brushes>
            <BackgroundBrush><SolidColorBrush><Color A="0" R="1" G="1" B="1" /></SolidColorBrush></BackgroundBrush>
            <BorderBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0" /></SolidColorBrush></BorderBrush>
            <StrokeBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0" /></SolidColorBrush></StrokeBrush>
            <FillBrush><SolidColorBrush><Color A="0" R="0" G="0" B="0" /></SolidColorBrush></FillBrush>
          </Brushes>
          <Rotation>Rotation0</Rotation>
          <OutlineThickness>1</OutlineThickness>
          <IsOutlined>False</IsOutlined>
          <BorderStyle>SolidLine</BorderStyle>
          <Margin><DYMOThickness Left="0" Top="0" Right="0" Bottom="0" /></Margin>
          <HorizontalAlignment>${alignment}</HorizontalAlignment>
          <VerticalAlignment>Middle</VerticalAlignment>
          <FitMode>AlwaysFit</FitMode>
          <IsVertical>False</IsVertical>
          <FormattedText>
            <FitMode>AlwaysFit</FitMode>
            <HorizontalAlignment>${alignment}</HorizontalAlignment>
            <VerticalAlignment>Middle</VerticalAlignment>
            <IsVertical>False</IsVertical>
            <LineTextSpan>
              <TextSpan>
                <Text>${text}</Text>
                <FontInfo>
                  <FontName>Arial</FontName>
                  <FontSize>${fontSize}</FontSize>
                  <IsBold>${isBold ? "True" : "False"}</IsBold>
                  <IsItalic>False</IsItalic>
                  <IsUnderline>False</IsUnderline>
                  <FontBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0" /></SolidColorBrush></FontBrush>
                </FontInfo>
              </TextSpan>
            </LineTextSpan>
          </FormattedText>
          <BarcodePosition>None</BarcodePosition>
          <ObjectLayout>
            <DYMOPoint><X>${x}</X><Y>${y}</Y></DYMOPoint>
            <Size><Width>${width}</Width><Height>${height}</Height></Size>
          </ObjectLayout>
        </AddressObject>`;
}

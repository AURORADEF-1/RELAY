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

export function buildDymoJobLabelXml(
  jobNumber: string,
  consumableName = "Large Address Labels",
) {
  const safeJobNumber = escapeXml(jobNumber.trim() || "TBC");
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
        <BarcodeObject>
          <Name>JOB_NUMBER</Name>
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
          <BarcodeFormat>Code128Auto</BarcodeFormat>
          <Data><MultiDataString><DataString>${safeJobNumber}</DataString></MultiDataString></Data>
          <HorizontalAlignment>Center</HorizontalAlignment>
          <VerticalAlignment>Middle</VerticalAlignment>
          <Size>Small</Size>
          <TextPosition>Bottom</TextPosition>
          <FontInfo>
            <FontName>Arial</FontName>
            <FontSize>12</FontSize>
            <IsBold>True</IsBold>
            <IsItalic>False</IsItalic>
            <IsUnderline>False</IsUnderline>
            <FontBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0" /></SolidColorBrush></FontBrush>
          </FontInfo>
          <ObjectLayout>
            <DYMOPoint><X>0.2350952</X><Y>0.1620453</Y></DYMOPoint>
            <Size><Width>3.029809</Width><Height>0.96</Height></Size>
          </ObjectLayout>
        </BarcodeObject>
      </LabelObjects>
    </DynamicLayoutManager>
  </DYMOLabel>
  <LabelApplication>Blank</LabelApplication>
  <DataTable><Columns></Columns><Rows></Rows></DataTable>
</DesktopLabel>`;
}

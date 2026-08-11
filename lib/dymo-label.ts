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
  partNumber?: string | null;
  partDescription?: string | null;
  unitIndex?: number;
  unitTotal?: number;
  binLocation?: string | null;
};

export function buildDymoJobLabelXml(
  content: string | DymoJobLabelContent,
  consumableName = "Large Address Labels",
) {
  const normalizedContent: DymoJobLabelContent = typeof content === "string"
    ? { barcodeValue: content, jobNumber: content }
    : content;
  const safeBarcodeValue = escapeXml(normalizedContent.barcodeValue.trim() || "TBC");
  const safeJobNumber = escapeXml(normalizedContent.jobNumber.trim() || "TBC");
  const unitText = normalizedContent.unitTotal && normalizedContent.unitTotal > 1
    ? `${normalizedContent.unitIndex ?? 1} of ${normalizedContent.unitTotal}`
    : "";
  const detailText = [
    normalizedContent.partNumber?.trim() || "General job label",
    unitText,
    normalizedContent.binLocation?.trim() ? `BIN ${normalizedContent.binLocation.trim()}` : "",
  ].filter(Boolean).join(" · ");
  const safeDetailText = escapeXml(detailText);
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
            <DYMOPoint><X>0.52</X><Y>0.06</Y></DYMOPoint>
            <Size><Width>2.46</Width><Height>0.58</Height></Size>
          </ObjectLayout>
        </BarcodeObject>
        <AddressObject>
          <Name>JOB_NUMBER_TEXT</Name>
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
          <HorizontalAlignment>Center</HorizontalAlignment>
          <VerticalAlignment>Middle</VerticalAlignment>
          <FitMode>AlwaysFit</FitMode>
          <IsVertical>False</IsVertical>
          <FormattedText>
            <FitMode>AlwaysFit</FitMode>
            <HorizontalAlignment>Center</HorizontalAlignment>
            <VerticalAlignment>Middle</VerticalAlignment>
            <IsVertical>False</IsVertical>
            <LineTextSpan>
              <TextSpan>
                <Text>${safeJobNumber}</Text>
                <FontInfo>
                  <FontName>Arial</FontName>
                  <FontSize>12</FontSize>
                  <IsBold>True</IsBold>
                  <IsItalic>False</IsItalic>
                  <IsUnderline>False</IsUnderline>
                  <FontBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0" /></SolidColorBrush></FontBrush>
                </FontInfo>
              </TextSpan>
            </LineTextSpan>
          </FormattedText>
          <BarcodePosition>None</BarcodePosition>
          <ObjectLayout>
            <DYMOPoint><X>0.35</X><Y>0.66</Y></DYMOPoint>
            <Size><Width>2.8</Width><Height>0.25</Height></Size>
          </ObjectLayout>
        </AddressObject>
        <AddressObject>
          <Name>PART_DETAIL_TEXT</Name>
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
          <HorizontalAlignment>Center</HorizontalAlignment>
          <VerticalAlignment>Middle</VerticalAlignment>
          <FitMode>AlwaysFit</FitMode>
          <IsVertical>False</IsVertical>
          <FormattedText>
            <FitMode>AlwaysFit</FitMode>
            <HorizontalAlignment>Center</HorizontalAlignment>
            <VerticalAlignment>Middle</VerticalAlignment>
            <IsVertical>False</IsVertical>
            <LineTextSpan>
              <TextSpan>
                <Text>${safeDetailText}</Text>
                <FontInfo>
                  <FontName>Arial</FontName>
                  <FontSize>9</FontSize>
                  <IsBold>True</IsBold>
                  <IsItalic>False</IsItalic>
                  <IsUnderline>False</IsUnderline>
                  <FontBrush><SolidColorBrush><Color A="1" R="0" G="0" B="0" /></SolidColorBrush></FontBrush>
                </FontInfo>
              </TextSpan>
            </LineTextSpan>
          </FormattedText>
          <BarcodePosition>None</BarcodePosition>
          <ObjectLayout>
            <DYMOPoint><X>0.35</X><Y>0.94</Y></DYMOPoint>
            <Size><Width>2.8</Width><Height>0.22</Height></Size>
          </ObjectLayout>
        </AddressObject>
      </LabelObjects>
    </DynamicLayoutManager>
  </DYMOLabel>
  <LabelApplication>Blank</LabelApplication>
  <DataTable><Columns></Columns><Rows></Rows></DataTable>
</DesktopLabel>`;
}

/**
 * 本届展会真实展馆与展位编号（从官方参观指南图提取）。
 *
 * `codeSource` 标明编号来源：`text` 是源 PDF 里的活文字（B 区，100% 准确）；
 * `ocr` 是逐展位裁剪图像识别补出的（A 区，源 PDF 编号被转曲，实测约 1.5%
 * 可能识别错，详见 docs/acceptance/hall-maps.md）。
 */

export interface VenueHall {
  hallId: string;
  name: string;
  region: 'A' | 'B';
  /** 与 SVG 中 `shape_<slug>_<code>` 的 slug 部分一致。 */
  shapeSlug: string;
  codeSource: 'text' | 'ocr';
  boothCodes: string[];
}

export const VENUE_HALLS: VenueHall[] = [
  {
    hallId: 'hall_a11',
    name: '1.1馆',
    region: 'A',
    shapeSlug: 'a11',
    codeSource: 'ocr',
    boothCodes: [
      'E01A', 'E02A', 'E03', 'E04A', 'E04J', 'E05A', 'E05J', 'E06A', 'E06J', 'E07A', 'E07J',
      'E08B', 'E09', 'E10A', 'E10B', 'E11A', 'E11B', 'E12A', 'E13A', 'E13B', 'E14', 'E15',
      'E16A', 'E16B', 'E16C', 'E16D', 'E17A', 'E18A', 'E19A', 'E19B', 'E19C', 'E19D',
      'E20A', 'E20B', 'E20D', 'E21', 'F01A', 'F02A', 'F03A', 'F03J', 'F04A', 'F04J', 'F05A',
      'F05J', 'F06A', 'F07A', 'F07E', 'F07J', 'G01A', 'G01B', 'G01K', 'G02A', 'G02J',
      'G02K', 'G03A', 'G03J', 'G03K', 'G04A', 'G04E', 'G04J', 'G05A', 'G05J', 'G05K',
      'G10A', 'G10B', 'G11', 'H01A', 'H01B', 'H01K', 'H02A', 'H02J', 'H02K', 'H03A', 'H03J',
      'H03K'
    ],
  },
  {
    hallId: 'hall_a21',
    name: '2.1馆',
    region: 'A',
    shapeSlug: 'a21',
    codeSource: 'ocr',
    boothCodes: [
      'E01', 'E02A', 'E02L', 'E03', 'E04A', 'E04L', 'E05A', 'E05L', 'E06', 'E07A', 'E07L',
      'E08A', 'E08H', 'E09A', 'E09B', 'E09H', 'E10A', 'E10H', 'E11A', 'E11H', 'E12A',
      'E12H', 'E13A', 'E13H', 'E14A', 'E14H', 'F01', 'F02A', 'F02J', 'F03', 'F04A', 'F05A',
      'F06', 'F07A', 'F07J', 'F08A', 'F15', 'F17A', 'F17B', 'F21A', 'F21B', 'F21E', 'G01A',
      'G01J', 'G02A', 'G03A', 'G04A', 'G10', 'G11', 'H01A', 'H01J', 'H02A', 'H03A', 'H04A',
      'H10A'
    ],
  },
  {
    hallId: 'hall_a22',
    name: '2.2馆',
    region: 'A',
    shapeSlug: 'a22',
    codeSource: 'ocr',
    boothCodes: [
      'E01A', 'E01J', 'E01K', 'E02A', 'E02J', 'E03J', 'E04', 'E05A', 'E05B', 'E05D', 'E06A',
      'E06B', 'E06C', 'E06D', 'E06E', 'E06F', 'E07A', 'E07B', 'E07C', 'E07D', 'E07E',
      'E07F', 'E08A', 'E08B', 'E08C', 'E08D', 'E09', 'E10', 'E11', 'F01A', 'F01K', 'F02A',
      'F02J', 'F03A', 'F03J', 'F03K', 'F04A', 'F05A', 'F05B', 'F06A', 'F06B', 'F06C', 'F15',
      'G01J', 'G02A', 'G02J', 'G03A', 'G03G', 'G04A', 'G04J', 'G05A', 'G05J', 'G05K',
      'G06A', 'G06J', 'G06K', 'G07A', 'G07C', 'G08A', 'G08D', 'G090', 'G09F', 'G100',
      'G10A', 'G10E', 'G11A', 'G11C', 'G11E', 'G11F', 'G120', 'G12A', 'G12F', 'G12H',
      'G13A', 'G13B', 'G13C', 'G13D', 'G14A', 'G14D', 'G15', 'G16A', 'G16B', 'G17A', 'G17B',
      'G18', 'H01A', 'H01J', 'H02A', 'H02J', 'H03A', 'H03G', 'H03H', 'H03J', 'H03K', 'H04A',
      'H04G', 'H04H', 'H05A', 'H05G', 'H05J', 'H06A', 'H06G', 'H06J', 'H09A', 'H09B',
      'H09E', 'H10A', 'H10D', 'J01A', 'J01E', 'J01J', 'J02G', 'J02H', 'J02J', 'J02K',
      'J03A', 'J07A', 'J07B', 'J07C', 'J07D', 'J08A', 'J08C', 'J08D', 'J09B', 'J09D',
      'J10A', 'J10B', 'J10C', 'J10D', 'J14A', 'J15A', 'J15B', 'K01A', 'K01G', 'K01H',
      'K01J', 'K01K', 'K02A', 'K02G', 'K02H', 'K02J', 'K02K', 'K07A', 'K07B', 'K08A',
      'K08B', 'K09'
    ],
  },
  {
    hallId: 'hall_a31',
    name: '3.1馆',
    region: 'A',
    shapeSlug: 'a31',
    codeSource: 'ocr',
    boothCodes: [
      'E01', 'E02', 'E03', 'E04', 'E05', 'E06A', 'E06J', 'E07A', 'E07J', 'E08', 'E09',
      'E10', 'E11', 'E12', 'E13A', 'E13B', 'E14', 'E15', 'E16A', 'E18A', 'E19C', 'E20B',
      'E21A', 'E21B', 'F01', 'F02A', 'F02J', 'F03', 'F04', 'F05', 'F06', 'F07A', 'F07J',
      'F08', 'F09', 'F10', 'F11', 'F12', 'F13', 'F14', 'F15A', 'F16A', 'F16B', 'F17A',
      'F17B', 'F18A', 'F18B', 'F19A', 'F19B', 'F20A', 'F20B', 'F21A', 'F21B', 'G01A',
      'G01J', 'G02A', 'G03A', 'G10', 'G11A', 'G11B', 'G11C', 'H01A', 'H01G', 'H02A', 'H03A',
      'H10A', 'H10B', 'H11', 'H12A', 'H12B', 'H12C', 'H12D', 'H12E', 'H12F', 'H13A', 'H13B',
      'H13C', 'H13D', 'H14A', 'H14C', 'H14D', 'H18A', 'H18B', 'H18E', 'H18F', 'H21A',
      'H21B', 'H21E', 'H21F'
    ],
  },
  {
    hallId: 'hall_a32',
    name: '3.2馆',
    region: 'A',
    shapeSlug: 'a32',
    codeSource: 'ocr',
    boothCodes: [
      'A066', 'A069', 'A071', 'A082', 'E01', 'E02', 'E03', 'E04A', 'E04B', 'E04D', 'E07A',
      'E08A', 'E08B', 'E09', 'F01', 'F02', 'F03', 'F04D', 'F07D', 'F07E', 'F08A', 'F08C',
      'F09A', 'G01', 'G02A', 'G02H', 'G03A', 'G03G', 'G04A', 'G04H', 'G05A', 'G05G', 'G05H',
      'G06A', 'G06H', 'G07G', 'G08E', 'G08F', 'G090', 'G09A', 'G09D', 'G10A', 'G15A', 'H01',
      'H02A', 'H02H', 'H03A', 'H03H', 'H04A', 'H04E', 'H05A', 'H05G', 'H06A', 'H06H',
      'H07A', 'H07C', 'H08A', 'H08C', 'H08E', 'H08G', 'H09A', 'H09C', 'H09F', 'H10A',
      'H10C', 'H10E', 'H10G', 'H11A', 'H11B', 'H12C', 'H12D', 'H12F', 'H13A', 'H14A',
      'H14C', 'H15A', 'J01A', 'J02A', 'J03A', 'J04A', 'K01A', 'K01H', 'K02A', 'K03A',
      'K04A', 'K06B', 'K07A', 'K07G', 'K09'
    ],
  },
  {
    hallId: 'hall_a41',
    name: '4.1馆',
    region: 'A',
    shapeSlug: 'a41',
    codeSource: 'ocr',
    boothCodes: [
      'E01A', 'E01L', 'E02A', 'E02G', 'E02L', 'E03A', 'E03L', 'E04A', 'E04E', 'E04M',
      'E05A', 'E05E', 'E05L', 'E06A', 'E06E', 'E06L', 'E07A', 'E07J', 'E08A', 'E08B',
      'E08K', 'E08L', 'E09A', 'E09H', 'E10A', 'E10B', 'E10H', 'E11A', 'E11G', 'E12A',
      'E13A', 'E13B', 'E13H', 'E14A', 'E14H', 'F01A', 'F02A', 'F02E', 'F02L', 'F03A',
      'F03E', 'F03K', 'F04A', 'F04E', 'F04G', 'F05A', 'F05E', 'F05L', 'F06A', 'F06E',
      'F06L', 'F07A', 'F07E', 'F07K', 'F08A', 'F08B', 'F08K', 'F08L', 'F09A', 'F09H',
      'F10C', 'F10D', 'F10G', 'F11A', 'F11B', 'F12A', 'F13A', 'F13G', 'F14A', 'F14H',
      'G01A', 'G01B', 'G02A', 'G02E', 'G11', 'G12', 'G15A', 'G15C', 'G16A', 'G16B', 'G16F',
      'G16H', 'G17A', 'G17B', 'G17E', 'G17F', 'G18A', 'G18E', 'G18F', 'G18H', 'G21A',
      'G22A', 'G22C', 'G23A', 'G23B', 'G23C', 'G23D', 'G24A', 'G24B', 'G24C', 'G31A',
      'G32A', 'G32B', 'G33A', 'G33B', 'H01A', 'H01B', 'H02A', 'H02E', 'H15A', 'H15C',
      'H16A', 'H16B', 'H16D', 'H16G', 'H16H', 'H17A', 'H17B', 'H17C', 'H17D', 'H17G',
      'H17H', 'H18A', 'H18B', 'H18C', 'H18F', 'H18G', 'H18H', 'H21A', 'H22A', 'H22B',
      'H22C', 'H22D', 'H23A', 'H23B', 'H23C', 'H23D', 'H24A', 'H24B', 'H24C', 'H24D',
      'H31A', 'H32A', 'H33A'
    ],
  },
  {
    hallId: 'hall_a42',
    name: '4.2馆',
    region: 'A',
    shapeSlug: 'a42',
    codeSource: 'ocr',
    boothCodes: [
      'E01A', 'E02A', 'E03A', 'E04A', 'E04D', 'E04E', 'E04G', 'E05B', 'E05E', 'E07A',
      'E08A', 'E09', 'F01A', 'F02', 'F03A', 'F03J', 'F04A', 'F04B', 'F09A', 'F09B', 'G01',
      'G02A', 'G04A', 'G05A', 'G06A', 'G07A', 'G07C', 'G07E', 'G07G', 'G08A', 'G08E',
      'G09A', 'G09C', 'G09E', 'G09G', 'G10A', 'G10E', 'G11E', 'G11G', 'G13C', 'G13G',
      'G14C', 'G14G', 'G17A', 'G17D', 'H01A', 'H01K', 'H02A', 'H04A', 'H05A', 'H06A',
      'H10A', 'H17A', 'J01A', 'J03A', 'J03E', 'J04A', 'J04E', 'J05A', 'J05E', 'J07A',
      'K01A', 'K05A', 'K05D', 'K06A', 'K06D'
    ],
  },
  {
    hallId: 'hall_a51',
    name: '5.1馆',
    region: 'A',
    shapeSlug: 'a51',
    codeSource: 'ocr',
    boothCodes: [
      'E01A', 'E01G', 'E02A', 'E03A', 'E03L', 'E04A', 'E04K', 'E05A', 'E05L', 'E06L',
      'E07A', 'E08K', 'E08L', 'E09A', 'E09B', 'E09C', 'E09G', 'E09H', 'E10A', 'E10B',
      'E10C', 'E10D', 'E10G', 'E10H', 'E11A', 'E11B', 'E11C', 'E11D', 'E11G', 'E11H',
      'E12A', 'E12B', 'E12C', 'E12D', 'E12G', 'E12H', 'E13A', 'E13C', 'E13D', 'E13G',
      'E13H', 'E14C', 'E14D', 'E14H', 'F01A', 'F02A', 'F03A', 'F03H', 'F03L', 'F04A',
      'F05A', 'F05H', 'F05L', 'F06A', 'F06H', 'F06L', 'F07A', 'F07L', 'F08A', 'F08B',
      'F08K', 'F08L', 'F09A', 'F09G', 'F10A', 'F10G', 'F10H', 'F11A', 'F11D', 'F11H',
      'F12A', 'F12G', 'F12H', 'F13A', 'F13H', 'F14A', 'F14G', 'F14H', 'G01A', 'G02A',
      'G03A', 'G04A', 'H01A', 'H01J', 'H021', 'H02A', 'H02J', 'H03A', 'H03I', 'H03J',
      'H04A', 'H04D', 'H09A', 'H09B', 'H09E', 'H09F', 'H09G', 'H10A', 'H10C', 'H10J', 'H10L'
    ],
  },
  {
    hallId: 'hall_a52',
    name: '5.2馆',
    region: 'A',
    shapeSlug: 'a52',
    codeSource: 'ocr',
    boothCodes: [
      'B10', 'B11', 'B16', 'B21', 'B27', 'B29', 'B31', 'B33', 'B52', 'B63', 'B69', 'B71',
      'B79', 'B85', 'B90', 'E01', 'E02', 'E03', 'E05', 'E06', 'E07', 'E08', 'E09', 'E10',
      'E11', 'E12', 'E13', 'E15', 'E18', 'E19', 'E21', 'E23', 'E26', 'E27', 'E28', 'E30',
      'E32', 'E33', 'E35', 'F01A', 'F01H', 'F02A', 'F03A', 'F03J', 'F04C', 'F04E', 'F05',
      'F07', 'F09A', 'F09C', 'G17', 'H01A', 'H02A', 'H02C', 'H03A', 'H09A', 'H09C', 'H10A',
      'H10E', 'H10G', 'H11A', 'H11C', 'H18A', 'H18C', 'H19'
    ],
  },
  {
    hallId: 'hall_b91',
    name: '9.1馆',
    region: 'B',
    shapeSlug: 'b91',
    codeSource: 'text',
    boothCodes: [
      'E01A', 'E01F', 'E01J', 'E01K', 'E02A', 'E02K-1', 'E03A', 'E03J-1', 'E04A', 'E04J',
      'E04K', 'E05A', 'E05J', 'E05K', 'E06A', 'E06E', 'E06J', 'E07A', 'E07H', 'E08A',
      'E08E-1', 'E08F', 'E08G', 'E08H', 'E09A-1', 'E09E', 'E09F', 'E09G', 'E09H', 'E10A-1',
      'E10B', 'E10E', 'E10F', 'E10G', 'E10H', 'E11A', 'E11F', 'E11G', 'E11H', 'E12A-1',
      'E12E', 'E12F', 'E12G', 'E14', 'E15', 'E16', 'F01A', 'F01H', 'F01J', 'F01K', 'F01L',
      'F02A', 'F02H', 'F02L', 'F03A', 'F03K', 'F03L', 'F04A', 'F04L', 'F05A', 'F05H',
      'F05L', 'F06A', 'F06H', 'F06L', 'F07A', 'F07B', 'F07E', 'F07F', 'F07H', 'F08A',
      'F08B', 'F08C', 'F08D', 'F08E', 'F08F', 'F08G', 'F08H', 'F09A', 'F09B', 'F09C',
      'F09D', 'F10A', 'F10C', 'F10D', 'F11A', 'F11B', 'F12A', 'F12B', 'F12D', 'F18A',
      'F18B', 'G01A', 'G01J', 'G02A', 'G02C', 'G02D', 'G02J-1', 'G03A', 'G03J-1', 'G04A',
      'G04F', 'G04J-1', 'G04K', 'G05A', 'G05J', 'G06A', 'G06E', 'G06F', 'G06J-1', 'G06K-1',
      'G07A-1', 'G07B', 'G07E-1', 'G07F-1', 'G07G', 'G07H', 'G08A', 'G08B', 'G08E', 'G08F',
      'G08G', 'G08H', 'G09A', 'G09B', 'G09E', 'G09F', 'G09G', 'G09H', 'G10A-1', 'G10E',
      'G10F', 'G10G', 'G10H', 'G11A', 'G11G', 'G12A', 'G12B', 'G12H', 'G13', 'G14A', 'G14B',
      'G15', 'G16A', 'G16B', 'H01A', 'H01H', 'H01L', 'H02A', 'H02H', 'H02K', 'H03A', 'H03H',
      'H03K', 'H03L', 'H04A', 'H04H', 'H05A', 'H06A', 'H06H', 'H09B', 'H10A', 'H10B',
      'H10C', 'H10D', 'H10E', 'H10F', 'H10G', 'H10H', 'H11A', 'H11B', 'H11C', 'H11D',
      'H11E', 'H11G', 'H11H', 'H12A', 'H12B', 'H12C', 'H12E', 'H12H', 'H13A', 'H13B',
      'H14A', 'H14B', 'H15A', 'H15B', 'H16A', 'H16B', 'H17A', 'H17B', 'M15', 'M21', 'W01'
    ],
  },
  {
    hallId: 'hall_b92',
    name: '9.2馆',
    region: 'B',
    shapeSlug: 'b92',
    codeSource: 'text',
    boothCodes: [
      'E01', 'E02', 'E03', 'E04', 'E06', 'E07A', 'E07H', 'E08A', 'E08H', 'E09A', 'E09H',
      'E10A', 'E10H', 'E11A', 'E11G', 'E11H', 'E12A', 'E12B', 'E12H', 'E13', 'E14', 'E15',
      'E16', 'F01', 'F02A', 'F02J', 'F03A', 'F05', 'F06', 'F07A', 'F07H', 'F08A', 'F08G',
      'F08H', 'F09A', 'F09F', 'F09G', 'F10A', 'F10G', 'F11A', 'F12A', 'F16', 'F17', 'F18',
      'F19', 'G01', 'G02', 'G03A', 'G03C', 'G10A', 'G11A', 'G11G', 'G11H', 'G12A', 'G12H',
      'G13', 'G14', 'H02', 'H12A', 'H12H', 'H13'
    ],
  },
  {
    hallId: 'hall_b101',
    name: '10.1馆',
    region: 'B',
    shapeSlug: 'b101',
    codeSource: 'text',
    boothCodes: [
      'E01A', 'E02A', 'E02J', 'E02K', 'E03A', 'E03J', 'E04A', 'E04J', 'E05A', 'E05J',
      'E06A', 'E06J', 'E07A', 'E08E', 'E08F', 'E08G', 'E08H', 'E09A', 'E09B', 'E09H',
      'E10A', 'E10B', 'E10G', 'E11E', 'E11F', 'E11G', 'E11H', 'E12A', 'E12B', 'E12E',
      'E12F', 'F01A', 'F02A', 'F03A', 'F03K', 'F04A', 'F04J', 'F05K', 'F06A', 'F06J',
      'F07A', 'F07E', 'F07H', 'F08E', 'F08F', 'F08G', 'F08H', 'F09A', 'F09B', 'F09C',
      'F09E', 'F09F', 'F09G', 'F10A', 'F10B', 'F10C', 'F10D', 'F10E', 'F10F', 'F10G',
      'F10H', 'F11A', 'F11B', 'F11D', 'F11E', 'F11F', 'F11H', 'F12A', 'F12B', 'F12C',
      'F12D', 'F12E', 'F12F', 'F13A', 'F13B', 'F14A', 'F15A', 'F16A', 'F16B', 'F17', 'G01A',
      'G01J', 'G02A', 'G02J', 'G02K', 'G03A', 'G03B', 'G04A', 'G04B', 'G05A', 'G05B',
      'G05C', 'G05J', 'G06A', 'G06J', 'G06K', 'G07A', 'G07B', 'G08A', 'G08C', 'G08E',
      'G08F', 'G08H', 'G09B', 'G09G', 'G09H', 'G10A', 'G10G', 'G10H', 'G11A', 'G11E',
      'G11G', 'G11H', 'G12A', 'H01', 'H02A', 'H02J', 'H02K', 'H03A', 'H03J', 'H04A', 'H04J',
      'H04K', 'H05A', 'H05J', 'H06A', 'H06J', 'H06K', 'H07A', 'H07B', 'H07C', 'H07E',
      'H07F', 'H08A', 'H08B', 'H08C', 'H08D', 'H08E', 'H08G', 'H08H', 'H09A', 'H09B',
      'H09C', 'H09D', 'H09E', 'H09F', 'H09H', 'H10A', 'H10B', 'H10E', 'H10F', 'H10G',
      'H10H', 'H11A', 'H11B', 'H11E', 'H11F', 'H11H', 'H12A', 'H12B', 'H12E', 'H12H', 'H13',
      'H14A', 'H14B', 'H15A', 'H16A', 'H16B', 'H17A', 'H17B'
    ],
  },
  {
    hallId: 'hall_b102',
    name: '10.2馆',
    region: 'B',
    shapeSlug: 'b102',
    codeSource: 'text',
    boothCodes: [
      'E01', 'E02', 'E03', 'E04A', 'E05A', 'E06', 'E07A', 'E07H', 'E08A', 'E08H', 'E09A',
      'E09G', 'E09H', 'E10A', 'E10B', 'E10G', 'E10H', 'E11A', 'E11G', 'E11H', 'E12A',
      'E12B', 'E12H', 'E13', 'E13B', 'E15', 'E16', 'F01', 'F02', 'F03A', 'F04A', 'F04L',
      'F05', 'F06', 'F07A', 'F07H', 'F08A', 'F08H', 'F09A', 'F09G', 'F09H', 'F10A', 'F10G',
      'F11A', 'F14', 'F15', 'F16', 'G01', 'G02A', 'G02L', 'G03A', 'G03L', 'G04A', 'G10A',
      'G10B', 'G10G', 'G10H', 'G11A', 'G11G', 'G11H', 'G12A', 'G12H', 'G13', 'G14', 'H01',
      'H02A', 'H02L', 'H03A', 'H04A', 'H10A', 'H10B', 'H10G', 'H10H', 'H11A', 'H11B',
      'H11G', 'H11H', 'H12A', 'H12H', 'H13', 'H14'
    ],
  },
  {
    hallId: 'hall_b103',
    name: '10.3馆',
    region: 'B',
    shapeSlug: 'b103',
    codeSource: 'text',
    boothCodes: [
      'A01', 'A04', 'A05', 'A06', 'A08', 'A09', 'A10', 'B02', 'B04', 'B06', 'B07', 'B08',
      'B10', 'C01', 'C02', 'C04', 'C05', 'C08', 'C09', 'D02', 'D03', 'D04', 'D06', 'D07',
      'E01A-1', 'E01J', 'E01K', 'E02A', 'E02G', 'E03A', 'E03B', 'E03G', 'E03H', 'E03K',
      'E04A', 'E04B', 'E04C', 'E04G', 'E05A', 'E05G', 'E05J', 'E05K', 'E06A', 'E06G',
      'E06H', 'E06L', 'E07A', 'E07B', 'E07C', 'E07H', 'E08G', 'E08H', 'E09G', 'E09H',
      'E10G', 'E10H', 'E11G', 'E11H', 'E12A', 'E12B', 'E12C', 'E12G', 'E12H', 'E13A-1',
      'E13B', 'E14A', 'E14B', 'E15A', 'E15B', 'F01', 'G01A', 'G01E', 'G15B', 'G16A', 'G16B',
      'G16G'
    ],
  },
  {
    hallId: 'hall_b111',
    name: '11.1馆',
    region: 'B',
    shapeSlug: 'b111',
    codeSource: 'text',
    boothCodes: [
      'E01A', 'E03A', 'E04A', 'E04G', 'E05A', 'E05J', 'E06A', 'E07A', 'E07D', 'E08A',
      'E08B', 'E09A', 'E09B', 'E10A', 'E10B', 'E11A', 'E11B', 'E12A', 'E12B', 'E13A',
      'E13B', 'E13C', 'E13D', 'E14A', 'E14B', 'E14C', 'E14D', 'E15A', 'E15B', 'E15C',
      'E15D', 'E16A', 'E16B', 'E16C', 'E16D', 'E17A', 'E17B', 'E17C', 'E17D', 'E18A',
      'E18D', 'E19A', 'E20A', 'E20B', 'E21A', 'E21B', 'E22A', 'E22B', 'E23A', 'E23B',
      'E24A', 'E24B', 'F01A', 'F01J', 'F02A', 'F02J', 'F03A', 'F03J', 'F04A', 'F04J',
      'F04K', 'F05A', 'F05J', 'F06A', 'F06J', 'F07A', 'F07E', 'F08A', 'F08E', 'F09A',
      'F09E', 'F11A', 'F11E', 'F12A', 'F12E', 'F13A', 'F13B', 'F14A', 'F14B', 'F15A',
      'F15B', 'F16A', 'F16B', 'F17A', 'F17D', 'G01A', 'G01J', 'G02A', 'G02G', 'G02H',
      'G02K', 'G03A', 'G03J', 'G03K', 'G04A', 'G04K', 'G05A', 'G05J', 'G06A', 'G06G',
      'G06H', 'G06K', 'G07A', 'G07B', 'G07C', 'G07D', 'G08A', 'G08B', 'G08C', 'G08D',
      'G09A', 'G09B', 'G09D', 'G10A', 'G10B', 'G11A', 'G11B', 'G12A', 'G12D', 'G13A',
      'G13D', 'G14A', 'G14B', 'G14C', 'G14D', 'G15A', 'G15B', 'G15C', 'G15D', 'G16A',
      'G16B', 'G16C', 'G16D', 'G17A', 'G17B', 'G17C', 'G17D', 'G18A', 'G18B', 'G18C',
      'G18D', 'G19A', 'G19B', 'G19C', 'G20B', 'G20C', 'G21B', 'G21C', 'G22B', 'G22C',
      'G23B', 'G23C', 'H01A', 'H01J', 'H02A', 'H02J', 'H02K', 'H03A', 'H04A', 'H04G',
      'H04J', 'H04K', 'H05A', 'H05J', 'H05K', 'H06A', 'H06G', 'H06J', 'H06K', 'H07A',
      'H07B', 'H07E', 'H10E', 'H11E', 'H12A', 'H12E', 'H13A', 'H13B', 'H14A', 'H14B'
    ],
  },
  {
    hallId: 'hall_b112',
    name: '11.2馆',
    region: 'B',
    shapeSlug: 'b112',
    codeSource: 'text',
    boothCodes: [
      'E01', 'E02', 'E03A-1', 'E03A-2', 'E03A-3', 'E03A-4', 'E03A-5', 'E04A', 'E04L',
      'E05A', 'E06A', 'E06L', 'E07A', 'E07B', 'E08A-1', 'E08B', 'E09A', 'E09B', 'E10A',
      'E10B', 'E11A', 'F01', 'F02', 'F03', 'F04A', 'F04L', 'F05A', 'F05G', 'F05L', 'F06A',
      'F06L', 'F07A', 'F07H', 'F08A', 'F08B', 'F08G', 'F09B', 'F09H', 'F10H', 'F11A',
      'F11B', 'F11H', 'F12A', 'F12H', 'G01A-1', 'G01A-2', 'G01A-3', 'G01A-4', 'G01A-5',
      'G01A-6', 'G01A-7', 'G01A-8', 'G01A-9', 'G02A-1', 'G02A-2', 'G02A-3', 'G02A-4',
      'G02A-5', 'G02A-6', 'G02A-7', 'G02A-8', 'G02A-9', 'G03A', 'G03B', 'G03F', 'G03H',
      'G03K', 'G04A-1', 'G04B', 'G04F', 'G04K', 'G04L', 'G10A-1', 'G10A-2', 'G10H', 'G11A',
      'G11B', 'G11C', 'G12A', 'H01A', 'H01E', 'H01F', 'H01G', 'H01H', 'H01L', 'H02A-2',
      'H02A-3', 'H02A-4', 'H02A-5', 'H02A-6', 'H02A-7', 'H02A-8', 'H03A', 'H03B', 'H03C',
      'H03D', 'H03E', 'H03F', 'H03L', 'H04A-1', 'H04L', 'H08B', 'H08C', 'H08D', 'H08G',
      'H08H', 'H09A', 'H09B', 'H09C', 'H09D', 'H09H', 'H11H', 'H12A', 'H12H', 'H16'
    ],
  },
  {
    hallId: 'hall_b113',
    name: '11.3馆',
    region: 'B',
    shapeSlug: 'b113',
    codeSource: 'text',
    boothCodes: [
      'E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07A', 'E08A', 'E08B', 'E09A', 'E09B',
      'E10A', 'E10B', 'E11A', 'E11B', 'E12A', 'E12B', 'E12E', 'E12F', 'E13A', 'E13B',
      'E14A', 'E14B', 'E15A', 'E15B', 'E16A', 'E17A', 'F01', 'F02', 'F03', 'F04', 'F05A',
      'F05J', 'F06', 'F07A', 'F07B', 'F08A', 'F08D', 'F09A', 'F09D', 'F10A', 'F10D', 'F11A',
      'F11D', 'F12', 'F13', 'F15', 'F16A', 'F16D', 'F17A', 'F17D', 'F18A', 'F18B', 'F19',
      'F20', 'F21A', 'F21B', 'F22', 'G01', 'G02A', 'G02J', 'G03A', 'G03J', 'G10A', 'G10B',
      'G10C', 'G10D', 'G11A', 'G11B', 'G12A', 'G12B', 'H01', 'H02', 'H03A', 'H10A', 'H10B',
      'H10D', 'H11', 'H12A', 'H12B', 'H13A', 'H13B', 'H13D', 'H14A', 'H14B', 'H15A', 'H15B',
      'H15C', 'H15D', 'H20', 'H21', 'H22'
    ],
  },
  {
    hallId: 'hall_b122',
    name: '12.2馆',
    region: 'B',
    shapeSlug: 'b122',
    codeSource: 'text',
    boothCodes: [
      'E01', 'E02A', 'E02J', 'E03', 'E04', 'E05A', 'E05B', 'E05C', 'E05D', 'E05E', 'E06C',
      'E06G', 'E07A', 'E07B', 'E07C', 'E07D', 'E08A', 'E08B', 'E08C', 'E08D', 'E08G',
      'E09A', 'E09C', 'E09D', 'E09F', 'E10A', 'E10B', 'E10D', 'E10E', 'F01', 'F02', 'F03',
      'F04A', 'F04J', 'F05', 'F06', 'F07A', 'F07B', 'F07D', 'F08A', 'F08D', 'F08F', 'F09A',
      'F09C', 'F09F', 'F10A', 'F10D', 'F11', 'F12A', 'F12F', 'F13', 'G01', 'G02', 'G02J',
      'G02K', 'G03', 'G04', 'G08A', 'G08C', 'G08D', 'G08F', 'G08G', 'G08H', 'G08I', 'G09A',
      'G09D', 'G09F', 'G09G', 'G09J', 'G10A', 'G10D', 'G10E', 'G11A', 'G12A', 'H01', 'H02A',
      'H03', 'H04', 'H08A', 'H08C', 'H08D', 'H08E', 'H08G', 'H08H', 'H08I', 'H09A', 'H09D',
      'H10', 'H11', 'H12A', 'H12C', 'H13A', 'H13C', 'H13D', 'H13F', 'H13G', 'H13H', 'H13I',
      'H13J', 'H17B', 'H17E'
    ],
  },
  {
    hallId: 'hall_b132',
    name: '13.2馆',
    region: 'B',
    shapeSlug: 'b132',
    codeSource: 'text',
    boothCodes: [
      'E01', 'E02A', 'E02L', 'E03A', 'E03L', 'E04A', 'E04L', 'E05', 'E06A', 'E06H', 'E07A',
      'E07G', 'E07H', 'E08A', 'E08G', 'E09A', 'E09G', 'E09H', 'E10A', 'E10H', 'E11', 'E12',
      'E13', 'F01A', 'F03A', 'F04A', 'F04B', 'F05A', 'F05L', 'F07A', 'F07B', 'F08A', 'F08B',
      'F09A', 'F10A', 'G01A', 'G02B', 'G09A', 'G11', 'G12A', 'G12C', 'G12E', 'G12J', 'H01A',
      'H01L', 'H02A'
    ],
  },
];

/** 可定位展位数量足够、适合放置演示数据的展馆。 */
export const ADDRESSABLE_HALLS: VenueHall[] = VENUE_HALLS.filter(
  (h) => h.boothCodes.length >= 20,
);

// Composites a landscape iPad Pro 13" screenshot into the DeviceKit "tablet5" bezel that ships
// with Xcode and writes a transparent PNG, as used for the README screenshots.
// usage: npm run screenshot:frame -- <screenshot> <out.png>
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let res = "/Library/Developer/DeviceKit/Chrome/tablet5.devicechrome/Contents/Resources/"
let screenPt = CGSize(width: 1376, height: 1032)   // landscape, points
let bezel: CGFloat = 46       // chrome.json sizing
let piece: CGFloat = 96       // corner / edge thickness
let pad: CGFloat = 12         // room for the side buttons
let screenRadius: CGFloat = 25
let buttonProtrude: CGFloat = 4

func loadImage(_ path: String) -> CGImage {
    let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil)!
    return CGImageSourceCreateImageAtIndex(src, 0, nil)!
}
func pdf(_ name: String) -> CGPDFPage {
    CGPDFDocument(URL(fileURLWithPath: res + name + ".pdf") as CFURL)!.page(at: 1)!
}
func makeContext(_ w: Int, _ h: Int) -> CGContext {
    CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0,
              space: CGColorSpace(name: CGColorSpace.sRGB)!,
              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data("frame-ipad: \(message)\n".utf8))
    exit(1)
}

guard CommandLine.arguments.count == 3 else { fail("usage: npm run screenshot:frame -- <screenshot> <out.png>") }
guard FileManager.default.fileExists(atPath: res) else { fail("Xcode's iPad bezel was not found at \(res)") }
guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: CommandLine.arguments[1]) as CFURL, nil),
      CGImageSourceCreateImageAtIndex(source, 0, nil) != nil else { fail("cannot read \(CommandLine.arguments[1])") }
let shot = loadImage(CommandLine.arguments[1])
// The bezel fits a 4:3 landscape screen; other shapes would spill past or fall short of it.
let aspect = CGFloat(shot.width) / CGFloat(shot.height)
guard abs(aspect - screenPt.width / screenPt.height) < 0.01 else {
    fail("expected a landscape iPad Pro 13\" screenshot (4:3, e.g. 2752x2064), got \(shot.width)x\(shot.height)")
}
let s = CGFloat(shot.width) / screenPt.width          // px per point

// --- Portrait chrome (y-up coordinates, origin bottom-left) ---
let pw = screenPt.height + 2 * (bezel + pad), ph = screenPt.width + 2 * (bezel + pad)
let pctx = makeContext(Int((pw * s).rounded()), Int((ph * s).rounded()))
pctx.scaleBy(x: s, y: s)

func draw(_ name: String, _ r: CGRect) {
    let page = pdf(name), box = page.getBoxRect(.mediaBox)
    pctx.saveGState()
    pctx.clip(to: r)   // stretched edge pieces otherwise bleed over the corners
    pctx.translateBy(x: r.minX, y: r.minY)
    pctx.scaleBy(x: r.width / box.width, y: r.height / box.height)
    pctx.drawPDFPage(page)
    pctx.restoreGState()
}

let o = CGRect(x: pad, y: pad, width: pw - 2 * pad, height: ph - 2 * pad)   // device outline

// Buttons sit under the chrome. Power: top edge, 74pt from the right.
// Volume: right edge, 100pt / 163pt from the top.
draw("iPadPowerBTN", CGRect(x: o.maxX - 74 - 63, y: o.maxY - 16 + buttonProtrude, width: 63, height: 16))
for top: CGFloat in [100, 163] {
    draw("VolBTN", CGRect(x: o.maxX - 16 + buttonProtrude, y: o.maxY - top - 52, width: 16, height: 52))
}

// Edges run 1pt under the corners so the joins leave no hairline seams.
let ov: CGFloat = 1
pctx.setFillColor(CGColor(gray: 0, alpha: 1))
pctx.fill(o.insetBy(dx: piece - ov, dy: piece - ov))
draw("iPadTop", CGRect(x: o.minX + piece - ov, y: o.maxY - piece, width: o.width - 2 * (piece - ov), height: piece))
draw("iPadBase", CGRect(x: o.minX + piece - ov, y: o.minY, width: o.width - 2 * (piece - ov), height: piece))
draw("iPadLeft", CGRect(x: o.minX, y: o.minY + piece - ov, width: piece, height: o.height - 2 * (piece - ov)))
draw("iPadRight", CGRect(x: o.maxX - piece, y: o.minY + piece - ov, width: piece, height: o.height - 2 * (piece - ov)))
draw("iPadTL", CGRect(x: o.minX, y: o.maxY - piece, width: piece, height: piece))
draw("iPadTR", CGRect(x: o.maxX - piece, y: o.maxY - piece, width: piece, height: piece))
draw("iPadBL", CGRect(x: o.minX, y: o.minY, width: piece, height: piece))
draw("iPadBR", CGRect(x: o.maxX - piece, y: o.minY, width: piece, height: piece))
let portrait = pctx.makeImage()!

// --- Rotate counter-clockwise to landscape and lay the screenshot on top ---
let lctx = makeContext(portrait.height, portrait.width)
lctx.saveGState()
lctx.translateBy(x: CGFloat(portrait.height), y: 0)
lctx.rotate(by: .pi / 2)
lctx.draw(portrait, in: CGRect(x: 0, y: 0, width: portrait.width, height: portrait.height))
lctx.restoreGState()

let inset = (bezel + pad) * s
let screenRect = CGRect(x: inset, y: inset, width: CGFloat(shot.width), height: CGFloat(shot.height))
lctx.addPath(CGPath(roundedRect: screenRect, cornerWidth: screenRadius * s, cornerHeight: screenRadius * s, transform: nil))
lctx.clip()
lctx.interpolationQuality = .high
lctx.draw(shot, in: screenRect)

let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: CommandLine.arguments[2]) as CFURL,
                                           UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, lctx.makeImage()!, nil)
CGImageDestinationFinalize(dest)

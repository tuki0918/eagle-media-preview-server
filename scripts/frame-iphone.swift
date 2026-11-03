// Composites a landscape iPhone Air screenshot into the DeviceKit "phone12" bezel that ships
// with Xcode and writes a transparent PNG, as used for the README screenshots.
// usage: npm run screenshot:frame:iphone -- <screenshot> <out.png>
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let res = "/Library/Developer/DeviceKit/Chrome/phone12.devicechrome/Contents/Resources/"
let screenPt = CGSize(width: 912, height: 420)     // landscape, points
let bezel: CGFloat = 18       // chrome.json sizing
let piece: CGFloat = 110      // corner / edge thickness
let pad: CGFloat = 9          // room for the side buttons
let screenRadius: CGFloat = 62
let buttonProtrude: CGFloat = 1.5
// The simulator draws the Dynamic Island itself, so screenshots never include it.
let island = CGSize(width: 37, height: 125)        // landscape, points
let islandInset: CGFloat = 11

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
    FileHandle.standardError.write(Data("frame-iphone: \(message)\n".utf8))
    exit(1)
}

guard CommandLine.arguments.count == 3 else { fail("usage: npm run screenshot:frame:iphone -- <screenshot> <out.png>") }
guard FileManager.default.fileExists(atPath: res) else { fail("Xcode's iPhone bezel was not found at \(res)") }
guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: CommandLine.arguments[1]) as CFURL, nil),
      CGImageSourceCreateImageAtIndex(source, 0, nil) != nil else { fail("cannot read \(CommandLine.arguments[1])") }
let shot = loadImage(CommandLine.arguments[1])
// The bezel fits a 912x420 landscape screen; other shapes would spill past or fall short of it.
let aspect = CGFloat(shot.width) / CGFloat(shot.height)
guard abs(aspect - screenPt.width / screenPt.height) < 0.01 else {
    fail("expected a landscape iPhone Air screenshot (e.g. 2736x1260), got \(shot.width)x\(shot.height)")
}
let s = CGFloat(shot.width) / screenPt.width          // px per point

// --- Portrait chrome (y-up coordinates, origin bottom-left) ---
let pw = screenPt.height + 2 * (bezel + pad), ph = screenPt.width + 2 * (bezel + pad)
let pctx = makeContext(Int((pw * s).rounded()), Int((ph * s).rounded()))
pctx.scaleBy(x: s, y: s)

func draw(_ name: String, _ rect: CGRect) {
    // Snap to whole pixels: the pieces are semi-transparent, so neighbours must neither
    // overlap (darker band) nor leave an anti-aliased gap (hairline seam).
    func snap(_ v: CGFloat) -> CGFloat { (v * s).rounded() / s }
    let r = CGRect(x: snap(rect.minX), y: snap(rect.minY),
                   width: snap(rect.maxX) - snap(rect.minX), height: snap(rect.maxY) - snap(rect.minY))
    let page = pdf(name), box = page.getBoxRect(.mediaBox)
    pctx.saveGState()
    pctx.clip(to: r)   // stretched edge pieces otherwise bleed over the corners
    pctx.translateBy(x: r.minX, y: r.minY)
    pctx.scaleBy(x: r.width / box.width, y: r.height / box.height)
    pctx.drawPDFPage(page)
    pctx.restoreGState()
}

let o = CGRect(x: pad, y: pad, width: pw - 2 * pad, height: ph - 2 * pad)   // device outline

// Buttons sit under the chrome, at the chrome.json offsets from the top.
// Left edge: Action 180pt, volume up 268pt, volume down 354pt. Right edge: power 293pt.
// The chrome is semi-transparent, so clip the buttons to just inside the outline;
// otherwise the hidden part of each button shows through as a dark block.
pctx.saveGState()
pctx.addRect(CGRect(x: 0, y: 0, width: pw, height: ph))
pctx.addPath(CGPath(roundedRect: o.insetBy(dx: 1, dy: 1), cornerWidth: 79, cornerHeight: 79, transform: nil))
pctx.clip(using: .evenOdd)
draw("Mute BTN", CGRect(x: o.minX - buttonProtrude, y: o.maxY - 180 - 34, width: 16, height: 34))
for top: CGFloat in [268, 354] {
    draw("Vol BTN", CGRect(x: o.minX - buttonProtrude, y: o.maxY - top - 64, width: 16, height: 64))
}
draw("X_Power BTN", CGRect(x: o.maxX - 16 + buttonProtrude, y: o.maxY - 293 - 101, width: 16, height: 101))
pctx.restoreGState()

// Edges butt against the corners; draw() snaps the joins to whole pixels.
let ov: CGFloat = 0
pctx.setFillColor(CGColor(gray: 0, alpha: 1))
pctx.fill(o.insetBy(dx: piece - ov, dy: piece - ov))
draw("Phone Top", CGRect(x: o.minX + piece - ov, y: o.maxY - piece, width: o.width - 2 * (piece - ov), height: piece))
draw("Phone Base", CGRect(x: o.minX + piece - ov, y: o.minY, width: o.width - 2 * (piece - ov), height: piece))
draw("Phone Left", CGRect(x: o.minX, y: o.minY + piece - ov, width: piece, height: o.height - 2 * (piece - ov)))
draw("Phone Right", CGRect(x: o.maxX - piece, y: o.minY + piece - ov, width: piece, height: o.height - 2 * (piece - ov)))
draw("Phone TL", CGRect(x: o.minX, y: o.maxY - piece, width: piece, height: piece))
draw("Phone TR", CGRect(x: o.maxX - piece, y: o.maxY - piece, width: piece, height: piece))
draw("Phone BL", CGRect(x: o.minX, y: o.minY, width: piece, height: piece))
draw("Phone BR", CGRect(x: o.maxX - piece, y: o.minY, width: piece, height: piece))
let portrait = pctx.makeImage()!

// --- Rotate counter-clockwise to landscape (Dynamic Island on the left) and lay the screenshot on top ---
let lctx = makeContext(portrait.height, portrait.width)
lctx.saveGState()
lctx.translateBy(x: CGFloat(portrait.height), y: 0)
lctx.rotate(by: .pi / 2)
lctx.draw(portrait, in: CGRect(x: 0, y: 0, width: portrait.width, height: portrait.height))
lctx.restoreGState()

let inset = (bezel + pad) * s
let screenRect = CGRect(x: inset, y: inset, width: CGFloat(shot.width), height: CGFloat(shot.height))
lctx.saveGState()
lctx.addPath(CGPath(roundedRect: screenRect, cornerWidth: screenRadius * s, cornerHeight: screenRadius * s, transform: nil))
lctx.clip()
lctx.interpolationQuality = .high
lctx.draw(shot, in: screenRect)
lctx.restoreGState()

let islandRect = CGRect(x: screenRect.minX + islandInset * s, y: screenRect.midY - island.height * s / 2,
                        width: island.width * s, height: island.height * s)
lctx.setFillColor(CGColor(gray: 0, alpha: 1))
lctx.addPath(CGPath(roundedRect: islandRect, cornerWidth: islandRect.width / 2, cornerHeight: islandRect.width / 2, transform: nil))
lctx.fillPath()

let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: CommandLine.arguments[2]) as CFURL,
                                           UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, lctx.makeImage()!, nil)
CGImageDestinationFinalize(dest)

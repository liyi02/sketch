var scriptPathStr = context.scriptPath.substring(0, context.scriptPath.lastIndexOf('/Sketch'))
var macOSVersion = NSDictionary.dictionaryWithContentsOfFile("/System/Library/CoreServices/SystemVersion.plist").objectForKey("ProductVersion") + "";
var lang = NSUserDefaults.standardUserDefaults().objectForKey("AppleLanguages").objectAtIndex(0);
var lang = (macOSVersion >= "10.12") ? lang.split("-").slice(0, -1).join("-") : lang;
var language = NSString.stringWithContentsOfFile_encoding_error(scriptPathStr + "/Resources/zh-Hans.json", 4, nil);
language = "I18N[\'" + "zh-cn" + "\'] = " + language;

var SM = {
    init: function (context) {
        // this.pluginRoot = this.scriptPath
        //             .stringByDeletingLastPathComponent()
        //             .stringByDeletingLastPathComponent()
        //             .stringByDeletingLastPathComponent();
        // this.pluginSketch = this.pluginRoot + "/Contents/Sketch/library";
        // this.pluginSketch = ""../
        // console.log(this.scriptPath);
    },
    find: function (format, container, returnArray) {
        if (!format || !format.key || !format.match) {
            return false;
        }
        var predicate = NSPredicate.predicateWithFormat(format.key, format.match),
            container = container || this.current,
            items;

        if (container.pages) {
            items = container.pages();
        }
        else if (this.is(container, MSSharedStyleContainer) || this.is(container, MSSharedTextStyleContainer)) {
            items = container.objectsSortedByName();
        }
        else if (container.children) {
            items = container.children();
        }
        else {
            items = container;
        }

        var queryResult = items.filteredArrayUsingPredicate(predicate);

        if (returnArray) return queryResult;

        if (queryResult.count() == 1) {
            return queryResult[0];
        } else if (queryResult.count() > 0) {
            return queryResult;
        } else {
            return false;
        }
    },
    getMask: function (group, layer, layerData, layerStates) {
        if (layer.hasClippingMask()) {
            if (layerStates.isMaskChildLayer) {
                this.maskCache.push({
                    objectID: this.maskObjectID,
                    rect: this.maskRect
                });
            }
            this.maskObjectID = group.objectID();
            this.maskRect = layerData.rect;
        }
        else if (!layerStates.isMaskChildLayer && this.maskCache.length > 0) {
            var mask = this.maskCache.pop();
            this.maskObjectID = mask.objectID;
            this.maskRect = mask.rect;
            layerStates.isMaskChildLayer = true;
        }
        else if (!layerStates.isMaskChildLayer) {
            this.maskObjectID = undefined;
            this.maskRect = undefined;
        }

        if (layerStates.isMaskChildLayer) {
            var layerRect = layerData.rect,
                maskRect = this.maskRect;

            layerRect.maxX = layerRect.x + layerRect.width;
            layerRect.maxY = layerRect.y + layerRect.height;
            maskRect.maxX = maskRect.x + maskRect.width;
            maskRect.maxY = maskRect.y + maskRect.height;

            var distance = this.getDistance(layerRect, maskRect),
                width = layerRect.width,
                height = layerRect.height;

            if (distance.left < 0) width += distance.left;
            if (distance.right < 0) width += distance.right;
            if (distance.top < 0) height += distance.top;
            if (distance.bottom < 0) height += distance.bottom;

            layerData.rect = {
                x: (distance.left < 0) ? maskRect.x : layerRect.x,
                y: (distance.top < 0) ? maskRect.y : layerRect.y,
                width: width,
                height: height
            }

        }
    },
    getSlice: function (layer, layerData, symbolLayer) {
        var objectID = (layerData.type == "symbol") ? this.toJSString(layer.symbolMaster().objectID()) :
            (symbolLayer) ? this.toJSString(symbolLayer.objectID()) :
                layerData.objectID;
        if (
            (
                layerData.type == "slice" ||
                (
                    layerData.type == "symbol" &&
                    this.hasExportSizes(layer.symbolMaster())
                )
            ) &&
            !this.sliceCache[objectID]
        ) {
            var sliceLayer = (layerData.type == "symbol") ? layer.symbolMaster() : layer;
            if (symbolLayer && this.is(symbolLayer.parentGroup(), MSSymbolMaster)) {
                layer.exportOptions().setLayerOptions(2);
            }

            this.assetsPath = this.savePath + "/assets";
            NSFileManager
                .defaultManager()
                .createDirectoryAtPath_withIntermediateDirectories_attributes_error(this.assetsPath, true, nil, nil);

            this.sliceCache[objectID] = layerData.exportable = this.getExportable(sliceLayer);
            this.slices.push({
                name: layerData.name,
                objectID: objectID,
                rect: layerData.rect,
                exportable: layerData.exportable
            })
        }
        else if (this.sliceCache[objectID]) {
            layerData.exportable = this.sliceCache[objectID];
        }
    },
    getText: function (artboard, layer, layerData, data) {

        if (layerData.type == "text" && layer.attributedString().treeAsDictionary().value.attributes.length > 1) {
            if (this.hasEmoji(layer)) {
                return false;
            }
            var self = this,
                svgExporter = SketchSVGExporter.new().exportLayers([layer.immutableModelObject()]),
                svgStrong = this.toJSString(NSString.alloc().initWithData_encoding(svgExporter, 4)),
                regExpTspan = new RegExp('<tspan([^>]+)>([^<]*)</tspan>', 'g'),
                regExpContent = new RegExp('>([^<]*)<'),
                offsetX, offsetY, textData = [],
                layerRect = this.getRect(layer),
                svgSpans = svgStrong.match(regExpTspan);

            for (var a = 0; a < svgSpans.length; a++) {
                var attrsData = this.getTextAttrs(svgSpans[a]);
                attrsData.content = svgSpans[a].match(regExpContent)[1];
                offsetX = (
                    !offsetX ||
                    (offsetX && offsetX > this.toJSNumber(attrsData.x))
                ) ?
                    this.toJSNumber(attrsData.x) : offsetX;

                offsetY = (
                    !offsetY ||
                    (offsetY && offsetY > this.toJSNumber(attrsData.y))
                ) ?
                    this.toJSNumber(attrsData.y) : offsetY;

                textData.push(attrsData);
            }

            var parentGroup = layer.parentGroup(),
                parentRect = self.getRect(parentGroup),
                colorHex = layerData.color["color-hex"].split(" ")[0];

            textData.forEach(function (tData) {

                if (
                    tData["content"].trim() &&
                    (
                        colorHex != tData.fill ||
                        Object.getOwnPropertyNames(tData).length > 4
                    )
                ) {
                    var textLayer = self.addText(),
                        colorRGB = self.hexToRgb(tData.fill || colorHex),
                        color = MSColor.colorWithRed_green_blue_alpha(colorRGB.r / 255, colorRGB.g / 255, colorRGB.b / 255, (tData["fill-opacity"] || 1));

                    textLayer.setName(tData.content);
                    textLayer.setStringValue(tData.content);
                    textLayer.setTextColor(color);
                    textLayer.setFontSize(tData["font-size"] || layerData.fontSize);

                    var defaultLineHeight = layer.font().defaultLineHeightForFont();

                    textLayer.setLineHeight(layer.lineHeight() || defaultLineHeight);

                    textLayer.setCharacterSpacing(self.toJSNumber(tData["letter-spacing"]) || layer.characterSpacing());
                    textLayer.setTextAlignment(layer.textAlignment())

                    if (tData["font-family"]) {
                        textLayer.setFontPostscriptName(tData["font-family"].split(",")[0]);
                    }
                    else {
                        textLayer.setFontPostscriptName(layer.fontPostscriptName());
                    }

                    parentGroup.addLayers([textLayer]);

                    var textLayerRect = self.getRect(textLayer);

                    textLayerRect.setX(layerRect.x + (self.toJSNumber(tData.x) - offsetX));
                    textLayerRect.setY(layerRect.y + (self.toJSNumber(tData.y) - offsetY));

                    self.getLayer(
                        artboard,
                        textLayer,
                        data
                    );

                    self.removeLayer(textLayer);
                }

            });
        }
    },
    writeFile: function (options) {
        var options = this.extend(options, {
            content: "Type something!",
            path: this.toJSString(NSTemporaryDirectory()),
            fileName: "temp.txt"
        }),
            content = NSString.stringWithString(options.content),
            savePathName = [];

        NSFileManager
            .defaultManager()
            .createDirectoryAtPath_withIntermediateDirectories_attributes_error(options.path, true, nil, nil);

        savePathName.push(
            options.path,
            "/",
            options.fileName
        );
        savePathName = savePathName.join("");

        content.writeToFile_atomically_encoding_error(savePathName, false, 4, null);
    },

    export: function () {
        var self = this;
        this.document = context.document;

        var page = this.document.currentPage();
        var artboard = page.currentArtboard();
        this.selectionArtboards = [artboard];

        // wanrning：此处已经处理好
        var savePath = this.getSavePath();
        var index1 = 0;

        var idx = 1,
            artboardIndex = 0,
            layerIndex = 0,
            layerCount = 0,
            exporting = false,
            data = {
                scale: 1,
                unit: "px",
                colorFormat: "color-hex",
                artboards: [],
                slices: [],
                colors: []
            };

        self.slices = [];
        self.sliceCache = {};
        self.maskCache = [];
        self.wantsStop = false;

        if (savePath) {
            this.savePath = savePath
            coscript.scheduleWithRepeatingInterval_jsFunction(0, function (interval) {
                if (!data.artboards[artboardIndex]) {
                    data.artboards.push({ layers: [], notes: [] });
                    self.maskCache = [];
                    self.maskObjectID = undefined;
                    self.maskRect = undefined;
                }
                if (!exporting) {
                    exporting = true;
                    var artboard = self.selectionArtboards[artboardIndex];
                    var page = artboard.parentGroup();
                    var layer = artboard.children()[layerIndex];

                    try {
                        self.getLayer(
                            artboard, // Sketch artboard element
                            layer, // Sketch layer element
                            data.artboards[artboardIndex] // Save to data
                        );

                        layerIndex++;
                        layerCount++;
                        exporting = false;
                    } catch (e) {
                        self.wantsStop = true;
                        log(e)
                    }

                    console.log("进度：" + (layerCount / artboard.children().length))
                    if (layerIndex >= artboard.children().length) {
                        console.log("成了！")
                        var objectID = artboard.objectID(),
                            artboardRect = self.getRect(artboard),
                            page = artboard.parentGroup(),
                            slug = self.toSlug(page.name() + ' ' + artboard.name());

                        data.artboards[artboardIndex].pageName = self.toHTMLEncode(self.emojiToEntities(page.name()));
                        data.artboards[artboardIndex].pageObjectID = self.toJSString(page.objectID());
                        data.artboards[artboardIndex].name = self.toHTMLEncode(self.emojiToEntities(artboard.name()));
                        data.artboards[artboardIndex].slug = slug;
                        data.artboards[artboardIndex].objectID = self.toJSString(artboard.objectID());
                        data.artboards[artboardIndex].width = artboardRect.width;
                        data.artboards[artboardIndex].height = artboardRect.height;

                        var newData = JSON.parse(JSON.stringify(data));
                        newData.artboards = [data.artboards[artboardIndex]];

                        data.artboards[artboardIndex].imagePath = "preview/" + encodeURI(slug) + ".png";

                        self.exportImage({
                            layer: artboard,
                            path: self.toJSString(savePath) + "/preview",
                            scale: 2,
                            // name: objectID,
                            name: slug
                        });

                        self.writeFile({
                            content: "<meta http-equiv=\"refresh\" content=\"0;url=../index.html#artboard" + artboardIndex + "\">",
                            path: self.toJSString(savePath) + "/links",
                            fileName: slug + ".html"
                        });

                        layerIndex = 0;
                        artboardIndex++;
                    }

                    if (artboardIndex >= self.selectionArtboards.length) {
                        var templateString = NSString.stringWithContentsOfFile_encoding_error(scriptPathStr + "/Resources/template.html", 4, nil);
                        var afterTemplate = self.template(templateString, { lang: language, data: JSON.stringify(newData) });
                        self.writeFile({
                            content: afterTemplate,
                            path: self.toJSString(savePath),
                            fileName: "index.html"
                        });
                        var selectingPath = savePath + "/index.html";
                        NSWorkspace.sharedWorkspace().activateFileViewerSelectingURLs([NSURL.fileURLWithPath(selectingPath)]);
                        self.wantsStop = true;
                    }

                    if (self.wantsStop === true) {
                        return interval.cancel();
                    }
                }
            });
        }
    },
    getSavePath: function () {
        var savePanel = NSSavePanel.savePanel();

        savePanel.setTitle("Export spec");
        savePanel.setNameFieldLabel("Export to:");
        savePanel.setPrompt("Export");
        savePanel.setCanCreateDirectories(true);

        if (savePanel.runModal() != NSOKButton) {
            return false;
        }

        return savePanel.URL().path();
    },
    template: function (content, data) {
        var content = content.replace(new RegExp("\\<\\!\\-\\-\\s([^\\s\\-\\-\\>]+)\\s\\-\\-\\>", "gi"), function ($0, $1) {
            if ($1 in data) {
                return data[$1];
            } else {
                return $0;
            }
        });
        return content;
    },
    extend: function (options, target) {
        var target = target || this;

        for (var key in options) {
            target[key] = options[key];
        }
        return target;
    },
},
    BorderPositions = ["center", "inside", "outside"],
    FillTypes = ["color", "gradient"],
    GradientTypes = ["linear", "radial", "angular"],
    ShadowTypes = ["outer", "inner"],
    TextAligns = ["left", "right", "center", "justify", "left"],
    ResizingType = ["stretch", "corner", "resize", "float"];

// api.js
SM.extend({
    is: function (layer, theClass) {
        if (!layer) return false;
        var klass = layer.class();
        return klass === theClass;
    },
    addGroup: function () {
        return MSLayerGroup.new();
    },
    addShape: function () {
        return MSShapeGroup.shapeWithRect(NSMakeRect(0, 0, 100, 100));

    },
    addText: function (container) {
        var text = MSTextLayer.new();
        text.setStringValue("text");
        return text;
    },
    removeLayer: function (layer) {
        var container = layer.parentGroup();
        if (container) container.removeLayer(layer);
    },
    getRect: function (layer) {
        var rect = layer.absoluteRect();
        return {
            x: Math.round(rect.x()),
            y: Math.round(rect.y()),
            width: Math.round(rect.width()),
            height: Math.round(rect.height()),
            maxX: Math.round(rect.x() + rect.width()),
            maxY: Math.round(rect.y() + rect.height()),
            setX: function (x) { rect.setX(x); this.x = x; this.maxX = this.x + this.width; },
            setY: function (y) { rect.setY(y); this.y = y; this.maxY = this.y + this.height; },
            setWidth: function (width) { rect.setWidth(width); this.width = width; this.maxX = this.x + this.width; },
            setHeight: function (height) { rect.setHeight(height); this.height = height; this.maxY = this.y + this.height; }
        };
    },
    toNopPath: function (str) {
        return this.toJSString(str).replace(/[\/\\\?]/g, " ");
    },
    toHTMLEncode: function (str) {
        return this.toJSString(str)
            .replace(/\</g, "&lt;")
            .replace(/\>/g, '&gt;')
            .replace(/\'/g, "&#39;")
            .replace(/\"/g, "&quot;")
            .replace(/\u2028/g, "\\u2028")
            .replace(/\u2029/g, "\\u2029")
            .replace(/\ud83c|\ud83d/g, "")
            ;
        // return str.replace(/\&/g, "&amp;").replace(/\"/g, "&quot;").replace(/\'/g, "&#39;").replace(/\</g, "&lt;").replace(/\>/g, '&gt;');
    },
    emojiToEntities: function (str) {
        var self = this,
            emojiRegExp = new RegExp("(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|[\ud83c[\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|[\ud83c[\ude32-\ude3a]|[\ud83c[\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c\udc04|[\u2600-\u26FF]|\u2b05|\u2b06|\u2b07|\u2b1b|\u2b1c|\u2b50|\u2b55|\u231a|\u231b|\u2328|\u23cf|[\u23e9-\u23f3]|[\u23f8-\u23fa]|\ud83c\udccf|\u2934|\u2935|[\u2190-\u21ff])", "g");
        return str.replace(
            emojiRegExp,
            function (match) {
                var u = "";
                for (var i = 0; i < match.length; i++) {
                    if (!(i % 2)) {
                        u += "&#" + match.codePointAt(i)
                    }
                }

                return u;
            });
    },
    toSlug: function (str) {
        return this.toJSString(str)
            .toLowerCase()
            .replace(/(<([^>]+)>)/ig, "")
            .replace(/[\/\+\|]/g, " ")
            .replace(new RegExp("[\\!@#$%^&\\*\\(\\)\\?=\\{\\}\\[\\]\\\\\\\,\\.\\:\\;\\']", "gi"), '')
            .replace(/\s+/g, '-')
            ;
    },
    toJSString: function (str) {
        return new String(str).toString();
    },
    toJSNumber: function (str) {
        return Number(this.toJSString(str));
    },
    pointToJSON: function (point) {
        return {
            x: parseFloat(point.x),
            y: parseFloat(point.y)
        };
    },
    rectToJSON: function (rect, referenceRect) {
        if (referenceRect) {
            return {
                x: Math.round((rect.x() - referenceRect.x()) * 10) / 10,
                y: Math.round((rect.y() - referenceRect.y()) * 10) / 10,
                width: Math.round(rect.width() * 10) / 10,
                height: Math.round(rect.height() * 10) / 10
            };
        }

        return {
            x: Math.round(rect.x() * 10) / 10,
            y: Math.round(rect.y() * 10) / 10,
            width: Math.round(rect.width() * 10) / 10,
            height: Math.round(rect.height() * 10) / 10
        };
    },
    colorToJSON: function (color) {
        var hexRGB = "#" + this.toHex(color.red() * 255) + this.toHex(color.green() * 255) + this.toHex(color.blue() * 255);
        return {
            r: Math.round(color.red() * 255),
            g: Math.round(color.green() * 255),
            b: Math.round(color.blue() * 255),
            a: color.alpha(),
            "color-hex": hexRGB + " " + Math.round(color.alpha() * 100) + "%",
            "argb-hex": "#" + this.toHex(color.alpha() * 255) + hexRGB.replace("#", ""),
            "css-rgba": "rgba(" + [
                Math.round(color.red() * 255),
                Math.round(color.green() * 255),
                Math.round(color.blue() * 255),
                (Math.round(color.alpha() * 100) / 100)
            ].join(",") + ")",
            "ui-color": "(" + [
                "r:" + (Math.round(color.red() * 100) / 100).toFixed(2),
                "g:" + (Math.round(color.green() * 100) / 100).toFixed(2),
                "b:" + (Math.round(color.blue() * 100) / 100).toFixed(2),
                "a:" + (Math.round(color.alpha() * 100) / 100).toFixed(2)
            ].join(" ") + ")"
        };
    },
    colorStopToJSON: function (colorStop) {
        return {
            color: this.colorToJSON(colorStop.color()),
            position: colorStop.position()
        };
    },
    gradientToJSON: function (gradient) {
        var stopsData = [],
            stop, stopIter = gradient.stops().objectEnumerator();
        while (stop = stopIter.nextObject()) {
            stopsData.push(this.colorStopToJSON(stop));
        }

        return {
            type: GradientTypes[gradient.gradientType()],
            from: this.pointToJSON(gradient.from()),
            to: this.pointToJSON(gradient.to()),
            colorStops: stopsData
        };
    },
    shadowToJSON: function (shadow) {
        return {
            type: shadow instanceof MSStyleShadow ? "outer" : "inner",
            offsetX: shadow.offsetX(),
            offsetY: shadow.offsetY(),
            blurRadius: shadow.blurRadius(),
            spread: shadow.spread(),
            color: this.colorToJSON(shadow.color())
        };
    },
    getRadius: function (layer) {
        if (layer.layers && this.is(layer.layers().firstObject(), MSRectangleShape)) {
            return (layer.layers().firstObject().cornerRadiusString().split(';').map(Number).length == 1) ? layer.layers().firstObject().fixedRadius() : layer.layers().firstObject().cornerRadiusString().split(';').map(Number);
        } else if (this.is(layer, MSRectangleShape)) {
            return (layer.cornerRadiusString().split(';').map(Number).length == 1) ? layer.fixedRadius() : layer.cornerRadiusString().split(';').map(Number);
        } else {
            return 0;
        }
    },
    getBorders: function (style) {
        var bordersData = [],
            border, borderIter = style.borders().objectEnumerator();
        while (border = borderIter.nextObject()) {
            if (border.isEnabled()) {
                var fillType = FillTypes[border.fillType()],
                    borderData = {
                        fillType: fillType,
                        position: BorderPositions[border.position()],
                        thickness: border.thickness()
                    };

                switch (fillType) {
                    case "color":
                        borderData.color = this.colorToJSON(border.color());
                        break;

                    case "gradient":
                        borderData.gradient = this.gradientToJSON(border.gradient());
                        break;

                    default:
                        continue;
                }

                bordersData.push(borderData);
            }
        }

        return bordersData;
    },
    getFills: function (style) {
        var fillsData = [],
            fill, fillIter = style.fills().objectEnumerator();
        while (fill = fillIter.nextObject()) {
            if (fill.isEnabled()) {
                var fillType = FillTypes[fill.fillType()],
                    fillData = {
                        fillType: fillType
                    };

                switch (fillType) {
                    case "color":
                        fillData.color = this.colorToJSON(fill.color());
                        break;

                    case "gradient":
                        fillData.gradient = this.gradientToJSON(fill.gradient());
                        break;

                    default:
                        continue;
                }

                fillsData.push(fillData);
            }
        }

        return fillsData;
    },
    getShadows: function (style) {
        var shadowsData = [],
            shadow, shadowIter = style.shadows().objectEnumerator();
        while (shadow = shadowIter.nextObject()) {
            if (shadow.isEnabled()) {
                shadowsData.push(this.shadowToJSON(shadow));
            }
        }

        shadowIter = style.innerShadows().objectEnumerator();
        while (shadow = shadowIter.nextObject()) {
            if (shadow.isEnabled()) {
                shadowsData.push(this.shadowToJSON(shadow));
            }
        }

        return shadowsData;
    },
    getOpacity: function (style) {
        return style.contextSettings().opacity()
    },
    getStyleName: function (layer) {
        var styles = (this.is(layer, MSTextLayer)) ? this.document.documentData().layerTextStyles() : this.document.documentData().layerStyles(),
            layerStyle = layer.style(),
            sharedObjectID = layerStyle.objectID(),
            style;

        styles = styles.objectsSortedByName();

        if (styles.count() > 0) {
            style = this.find({ key: "(objectID != NULL) && (objectID == %@)", match: sharedObjectID }, styles);
        }

        if (!style) return "";
        return this.toJSString(style.name());
    },
    updateContext: function () {
        this.context.document = NSDocumentController.sharedDocumentController().currentDocument();
        this.context.selection = this.context.document.selectedLayers().layers();

        return this.context;
    }
});

// help.js
SM.extend({
    toHex: function (c) {
        var hex = Math.round(c).toString(16).toUpperCase();
        return hex.length == 1 ? "0" + hex : hex;
    },
    hexToRgb: function (hex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: this.toHex(result[1]),
            g: this.toHex(result[2]),
            b: this.toHex(result[3])
        } : null;
    },
    getDistance: function (targetRect, containerRect) {
        var containerRect = containerRect || this.getRect(this.current);

        return {
            top: (targetRect.y - containerRect.y),
            right: (containerRect.maxX - targetRect.maxX),
            bottom: (containerRect.maxY - targetRect.maxY),
            left: (targetRect.x - containerRect.x),
        }
    },
    message: function (message) {
        this.document.showMessage(message);
    },
    find: function (format, container, returnArray) {
        if (!format || !format.key || !format.match) {
            return false;
        }
        var predicate = NSPredicate.predicateWithFormat(format.key, format.match),
            container = container || this.current,
            items;

        if (container.pages) {
            items = container.pages();
        }
        else if (this.is(container, MSSharedStyleContainer) || this.is(container, MSSharedTextStyleContainer)) {
            items = container.objectsSortedByName();
        }
        else if (container.children) {
            items = container.children();
        }
        else {
            items = container;
        }

        var queryResult = items.filteredArrayUsingPredicate(predicate);

        if (returnArray) return queryResult;

        if (queryResult.count() == 1) {
            return queryResult[0];
        } else if (queryResult.count() > 0) {
            return queryResult;
        } else {
            return false;
        }
    },
});

// export.js
SM.extend({
    hasEmoji: function (layer) {
        var fonts = layer.attributedString().fontNames().allObjects();
        return !!/AppleColorEmoji/.exec(fonts);
    },
    getExportable: function (layer, savePath) {
        var self = this,
            exportable = [],
            size, sizes = layer.exportOptions().exportFormats(),
            fileFormat = this.toJSString(sizes[0].fileFormat()),
            matchFormat = /png|jpg|tiff|webp/.exec(fileFormat);
        var exportFormats =
            [
                { scale: 1, suffix: "", format: fileFormat },
                { scale: 2, suffix: "@2x", format: fileFormat },
                { scale: 3, suffix: "@3x", format: fileFormat }
            ];

        for (var exportFormat of exportFormats) {
            var prefix = exportFormat.prefix || "",
                suffix = exportFormat.suffix || "";
            self.exportImage({
                layer: layer,
                path: self.assetsPath,
                scale: exportFormat.scale,
                name: layer.name(),
                prefix: prefix,
                suffix: suffix,
                format: exportFormat.format
            });

            exportable.push({
                name: self.toJSString(layer.name()),
                format: fileFormat,
                path: prefix + layer.name() + suffix + "." + exportFormat.format
            });
        }

        return exportable;
    },
    getSymbol: function (artboard, layer, layerData, data) {
        if (layerData.type == "symbol") {
            var self = this,
                symbolObjectID = this.toJSString(layer.symbolMaster().objectID());

            layerData.objectID = symbolObjectID;

            if (!self.hasExportSizes(layer.symbolMaster()) && layer.symbolMaster().children().count() > 1) {
                var symbolRect = this.getRect(layer),
                    symbolChildren = layer.symbolMaster().children(),
                    tempSymbol = layer.duplicate(),
                    tempGroup = tempSymbol.detachStylesAndReplaceWithGroupRecursively(false);

                var tempSymbolLayers = tempGroup.children().objectEnumerator(),
                    overrides = layer.overrides(),
                    idx = 0;

                overrides = (overrides) ? overrides.objectForKey(0) : undefined;

                var tempSymbolLayer = tempSymbolLayers.nextObject()
                while (tempSymbolLayer) {
                    if (self.is(tempSymbolLayer, MSSymbolInstance)) {
                        var symbolMasterObjectID = self.toJSString(symbolChildren[idx].objectID());
                        if (
                            overrides &&
                            overrides[symbolMasterObjectID] &&
                            !!overrides[symbolMasterObjectID].symbolID
                        ) {
                            var changeSymbol = self.find({ key: "(symbolID != NULL) && (symbolID == %@)", match: self.toJSString(overrides[symbolMasterObjectID].symbolID) }, self.document.documentData().allSymbols());
                            if (changeSymbol) {
                                tempSymbolLayer.changeInstanceToSymbol(changeSymbol);
                            }
                            else {
                                tempSymbolLayer = undefined;
                            }
                        }
                    }
                    if (tempSymbolLayer) {
                        self.getLayer(
                            artboard,
                            tempSymbolLayer,
                            data,
                            symbolChildren[idx]
                        );
                    }
                    tempSymbolLayer = tempSymbolLayers.nextObject()
                    idx++
                }
                this.removeLayer(tempGroup);
            }
        }
    },
    getTextAttrs: function (str) {
        var data = {},
            regExpAttr = new RegExp('([a-z\-]+)\=\"([^\"]+)\"', 'g'),
            regExpAttr1 = new RegExp('([a-z\-]+)\=\"([^\"]+)\"'),
            attrs = str.match(regExpAttr);
        for (var a = 0; a < attrs.length; a++) {
            var attrData = regExpAttr1.exec(attrs[a]),
                key = attrData[1],
                value = attrData[2];

            data[key] = value;
        }
        return data;
    }
})

// getlayer
SM.extend({
    rectToJSON: function (rect, referenceRect) {
        if (referenceRect) {
            return {
                x: Math.round((rect.x() - referenceRect.x()) * 10) / 10,
                y: Math.round((rect.y() - referenceRect.y()) * 10) / 10,
                width: Math.round(rect.width() * 10) / 10,
                height: Math.round(rect.height() * 10) / 10
            };
        }

        return {
            x: Math.round(rect.x() * 10) / 10,
            y: Math.round(rect.y() * 10) / 10,
            width: Math.round(rect.width() * 10) / 10,
            height: Math.round(rect.height() * 10) / 10
        };
    },
    emojiToEntities: function (str) {
        var self = this,
            emojiRegExp = new RegExp("(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|[\ud83c[\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|[\ud83c[\ude32-\ude3a]|[\ud83c[\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c\udc04|[\u2600-\u26FF]|\u2b05|\u2b06|\u2b07|\u2b1b|\u2b1c|\u2b50|\u2b55|\u231a|\u231b|\u2328|\u23cf|[\u23e9-\u23f3]|[\u23f8-\u23fa]|\ud83c\udccf|\u2934|\u2935|[\u2190-\u21ff])", "g");
        return str.replace(
            emojiRegExp,
            function (match) {
                var u = "";
                for (var i = 0; i < match.length; i++) {
                    if (!(i % 2)) {
                        u += "&#" + match.codePointAt(i)
                    }
                }

                return u;
            });
    },
    toHTMLEncode: function (str) {
        return this.toJSString(str)
            .replace(/\</g, "&lt;")
            .replace(/\>/g, '&gt;')
            .replace(/\'/g, "&#39;")
            .replace(/\"/g, "&quot;")
            .replace(/\u2028/g, "\\u2028")
            .replace(/\u2029/g, "\\u2029")
            .replace(/\ud83c|\ud83d/g, "")
            ;
        // return str.replace(/\&/g, "&amp;").replace(/\"/g, "&quot;").replace(/\'/g, "&#39;").replace(/\</g, "&lt;").replace(/\>/g, '&gt;');
    },
    regexNames: /OVERLAY\#|WIDTH\#|HEIGHT\#|TOP\#|RIGHT\#|BOTTOM\#|LEFT\#|VERTICAL\#|HORIZONTAL\#|NOTE\#|PROPERTY\#|LITE\#/,
    isSliceGroup: function (layer) {
        return this.is(layer, MSLayerGroup) && this.hasExportSizes(layer);
    },
    hasExportSizes: function (layer) {
        return layer.exportOptions().exportFormats().count() > 0;
    },
    isExportable: function (layer) {
        return this.is(layer, MSTextLayer) ||
            this.is(layer, MSShapeGroup) ||
            this.is(layer, MSRectangleShape) ||
            this.is(layer, MSOvalShape) ||
            this.is(layer, MSShapePathLayer) ||
            this.is(layer, MSTriangleShape) ||
            this.is(layer, MSStarShape) ||
            this.is(layer, MSPolygonShape) ||
            this.is(layer, MSBitmapLayer) ||
            this.is(layer, MSSliceLayer) ||
            this.is(layer, MSSymbolInstance) ||
            this.isSliceGroup(layer)
    },
    getStates: function (layer) {
        var isVisible = true,
            isLocked = false,
            hasSlice = false,
            isEmpty = false,
            isMaskChildLayer = false,
            isMeasure = false,
            isShapeGroup = false;

        while (!(this.is(layer, MSArtboardGroup) || this.is(layer, MSSymbolMaster))) {
            var group = layer.parentGroup();

            if (this.regexNames.exec(group.name())) {
                isMeasure = true;
            }

            if (this.is(group, MSShapeGroup)) {
                isShapeGroup = true;
            }

            if (!layer.isVisible()) {
                isVisible = false;
            }

            if (layer.isLocked()) {
                isLocked = true;
            }

            if (this.is(group, MSLayerGroup) && this.hasExportSizes(group)) {
                hasSlice = true
            }

            if (
                this.maskObjectID &&
                group.objectID() == this.maskObjectID &&
                !layer.shouldBreakMaskChain()
            ) {
                isMaskChildLayer = true
            }

            if (
                this.is(layer, MSTextLayer) &&
                layer.isEmpty()
            ) {
                isEmpty = true
            }

            layer = group;
        }
        return {
            isVisible: isVisible,
            isLocked: isLocked,
            hasSlice: hasSlice,
            isMaskChildLayer: isMaskChildLayer,
            isMeasure: isMeasure,
            isEmpty: isEmpty,
            isShapeGroup: isShapeGroup
        }
    },
    exportImage: function (options) {
        var options = this.extend(options, {
            layer: this.artboard,
            path: this.toJSString(NSTemporaryDirectory()),
            scale: 1,
            name: "preview",
            prefix: "",
            suffix: "",
            format: "png"
        }),
            document = this.document,
            slice = MSExportRequest.exportRequestsFromExportableLayer(options.layer).firstObject(),
            savePathName = [];

        slice.scale = options.scale;
        slice.format = options.format;

        savePathName.push(
            options.path,
            "/",
            options.prefix,
            options.name,
            options.suffix,
            ".",
            options.format
        );
        savePathName = savePathName.join("");

        document.saveArtboardOrSlice_toFile(slice, savePathName);

        return savePathName;
    },
    getLayer: function (artboard, layer, data, symbolLayer) {
        var artboardRect = artboard.absoluteRect(),
            group = layer.parentGroup(),
            layerStates = this.getStates(layer);

        if (layer && this.is(layer, MSLayerGroup) && /NOTE\#/.exec(layer.name())) {
            var textLayer = layer.children()[2];

            data.notes.push({
                rect: this.rectToJSON(textLayer.absoluteRect(), artboardRect),
                note: this.toHTMLEncode(this.emojiToEntities(textLayer.stringValue())).replace(/\n/g, "<br>")
            });
            layer.setIsVisible(false);
        }

        if (
            !this.isExportable(layer) ||
            !layerStates.isVisible ||
            (layerStates.isLocked && !this.is(layer, MSSliceLayer)) ||
            layerStates.isEmpty ||
            layerStates.hasSlice ||
            layerStates.isMeasure ||
            layerStates.isShapeGroup
        ) {
            return this;
        }

        var layerType = this.is(layer, MSTextLayer) ? "text" :
            this.is(layer, MSSymbolInstance) ? "symbol" :
                this.is(layer, MSSliceLayer) || this.hasExportSizes(layer) ? "slice" :
                    "shape";

        if (symbolLayer && layerType == "text" && layer.textBehaviour() == 0) { // fixed for v40
            layer.setTextBehaviour(1); // fixed for v40
            layer.setTextBehaviour(0); // fixed for v40
        } // fixed for v40

        var exportLayerRect;
        if (layerType != "text") {
            // export the influence rect.(include the area of shadows and outside borders...)
            var influenceCGRect = layer.absoluteInfluenceRect();
            exportLayerRect = {
                x: function () { return influenceCGRect.origin.x; },
                y: function () { return influenceCGRect.origin.y; },
                width: function () { return influenceCGRect.size.width; },
                height: function () { return influenceCGRect.size.height; }
            }
        }
        else {
            // export the default rect.
            exportLayerRect = layer.absoluteRect();
        }

        var layerData = {
            objectID: this.toJSString(layer.objectID()),
            type: layerType,
            name: this.toHTMLEncode(this.emojiToEntities(layer.name())),
            rect: this.rectToJSON(exportLayerRect, artboardRect)
        };

        if (symbolLayer) layerData.objectID = this.toJSString(symbolLayer.objectID());


        if (layerType != "slice") {
            var layerStyle = layer.style();
            layerData.rotation = layer.rotation();
            layerData.radius = this.getRadius(layer);
            layerData.borders = this.getBorders(layerStyle);
            layerData.fills = this.getFills(layerStyle);
            layerData.shadows = this.getShadows(layerStyle);
            layerData.opacity = this.getOpacity(layerStyle);
            layerData.styleName = this.getStyleName(layer);
        }

        if (layerType == "text") {
            layerData.content = this.toHTMLEncode(this.emojiToEntities(layer.stringValue()));
            layerData.color = this.colorToJSON(layer.textColor());
            layerData.fontSize = layer.fontSize();
            layerData.fontFace = this.toJSString(layer.fontPostscriptName());
            layerData.textAlign = TextAligns[layer.textAlignment()];
            layerData.letterSpacing = this.toJSNumber(layer.characterSpacing()) || 0;
            layerData.lineHeight = layer.lineHeight() || layer.font().defaultLineHeightForFont();
        }

        var layerCSSAttributes = layer.CSSAttributes(),
            css = [];

        for (var i = 0; i < layerCSSAttributes.count(); i++) {
            var c = layerCSSAttributes[i]
            if (! /\/\*/.exec(c)) css.push(this.toJSString(c));
        }
        if (css.length > 0) {
            layerData.css = css;
            if (this.is(layer, MSRectangleShape) && !!layer.fixedRadius()) {
                layerData.css.push('border-radius: ' + layer.cornerRadiusString().replace(/;/g, 'px ') + 'px;');
            }
        }

        this.getMask(group, layer, layerData, layerStates);
        this.getSlice(layer, layerData, symbolLayer);
        data.layers.push(layerData);
        this.getSymbol(artboard, layer, layerData, data);
        this.getText(artboard, layer, layerData, data);
    },
});

export const upload = context => {
    var sketch = require('sketch')

    var document = sketch.getSelectedDocument()

    var selectedLayers = document.selectedLayers;
    var selectedCount = selectedLayers.length

    SM.init(context);
    SM.export();
};



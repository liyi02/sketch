// function template (content, data) {
//         var content = content.replace(new RegExp("\\<\\!\\-\\-\\s([^\\s\\-\\-\\>]+)\\s\\-\\-\\>", "gi"), function($0, $1) {
//             if ($1 in data) {
//                 return data[$1];
//             } else {
//                 return $0;
//             }
//         });
//         return content;
// }
    
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
    find: function(format, container, returnArray){
        if(!format || !format.key  || !format.match){
            return false;
        }
        var predicate = NSPredicate.predicateWithFormat(format.key,format.match),
            container = container || this.current,
            items;

        if(container.pages){
            items = container.pages();
        }
        else if( this.is( container, MSSharedStyleContainer ) || this.is( container, MSSharedTextStyleContainer ) ){
            items = container.objectsSortedByName();
        }
        else if( container.children ){
            items = container.children();
        }
        else{
            items = container;
        }

        var queryResult = items.filteredArrayUsingPredicate(predicate);

        if(returnArray) return queryResult;

        if (queryResult.count() == 1){
            return queryResult[0];
        } else if (queryResult.count() > 0){
            return queryResult;
        } else {
            return false;
        }
    },

    export: function () {
        var self = this;
        this.document = context.document;
        // console.log(this.document);

        var page = this.document.currentPage();
        // console.log(page);
        var artboard = page.currentArtboard();
        this.selectionArtboards = [artboard];
        
            

        // wanrning：此处已经处理好
        // var savePath = this.getSavePath();
        // console.log(savePath);
        var index1 = 0;

        var idx = 1,
                    artboardIndex = 0,
                    layerIndex = 0,
                    layerCount = 0,
                    exporting = false,
                    data = {
                        scale: 1,
                        unit: "pt",
                        artboards: [],
                        slices: [],
                        colors: []
                    };

                self.slices = [];
                self.sliceCache = {};
                self.maskCache = [];
        self.wantsStop = false;




        coscript.scheduleWithRepeatingInterval_jsFunction(0, function (interval) {
            console.log("呼呼哈哈哈哈哈555");
            if(!data.artboards[artboardIndex]){
                        data.artboards.push({layers: [], notes: []});
                        self.maskCache = [];
                        self.maskObjectID = undefined;
                        self.maskRect = undefined;
            }
            if (!exporting) {
                exporting = true;
                var artboard = self.selectionArtboards[artboardIndex],
                    page = artboard.parentGroup(),
                    layer = artboard.children()[layerIndex],
                    message = page.name() + ' - ' + artboard.name() + ' - ' + layer.name();
                // log( page.name() + ' - ' + artboard.name() + ' - ' + layer.name());
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

                if (layerIndex >= artboard.children().length) {
                    console.log("layerIndex >= artboard.children()");
                    var objectID = artboard.objectID(),
                    artboardRect = self.getRect(artboard),
                    page = artboard.parentGroup(),
                    slug = self.toSlug(page.name() + ' ' + artboard.name());
                    console.log(slug);
                    layerIndex = 0;
                    artboardIndex++;
                }

                if (artboardIndex >= self.selectionArtboards.length) {
                    self.wantsStop = true;
                }
                
                if (self.wantsStop === true) {
                    console.log("已经停止了");
                    return interval.cancel();
                }
            }

        });
        
        // warning 此处替换计算路径
        var templateString = NSString.stringWithContentsOfFile_encoding_error("/Users/liyi/Desktop/newSketch2/my-plugin/src/library/template.html", 4, nil);
        var afterTemplate = this.template(templateString, "langlanglanglanglanglanglang");
    },
    getSavePath: function(){
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
    template: function(content, data) {
        var content = content.replace(new RegExp("\\<\\!\\-\\-\\s([^\\s\\-\\-\\>]+)\\s\\-\\-\\>", "gi"), function($0, $1) {
            // if ($1 in data) {
            //     return data[$1];
            // } else {
            //     return $0;
            // }
        });
        return content;
    },
    extend: function( options, target ){
            var target = target || this;

            for ( var key in options ){
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
    is: function(layer, theClass){
        if(!layer) return false;
        var klass = layer.class();
        return klass === theClass;
    },
    toJSNumber: function(str){
        return Number( this.toJSString(str) );
    },
    toJSString: function(str){
        return new String(str).toString();
    },
    toSlug: function(str){
        return this.toJSString(str)
                .toLowerCase()
                .replace(/(<([^>]+)>)/ig, "")
                .replace(/[\/\+\|]/g, " ")
                .replace(new RegExp("[\\!@#$%^&\\*\\(\\)\\?=\\{\\}\\[\\]\\\\\\\,\\.\\:\\;\\']", "gi"),'')
                .replace(/\s+/g,'-')
                ;
    },
    getRect: function(layer){
     var rect = layer.absoluteRect();
        return {
            x: Math.round(rect.x()),
            y: Math.round(rect.y()),
            width: Math.round(rect.width()),
            height: Math.round(rect.height()),
            maxX: Math.round(rect.x() + rect.width()),
            maxY: Math.round(rect.y() + rect.height()),
            setX: function(x){ rect.setX(x); this.x = x; this.maxX = this.x + this.width; },
            setY: function(y){ rect.setY(y); this.y = y; this.maxY = this.y + this.height; },
            setWidth: function(width){ rect.setWidth(width); this.width = width; this.maxX = this.x + this.width; },
            setHeight: function(height){ rect.setHeight(height); this.height = height; this.maxY = this.y + this.height; }
        };
    },
    colorToJSON: function(color) {
        return {
            r: Math.round(color.red() * 255),
            g: Math.round(color.green() * 255),
            b: Math.round(color.blue() * 255),
            a: color.alpha(),
            "color-hex": color.immutableModelObject + " " + Math.round(color.alpha() * 100) + "%",
            "argb-hex": "#" + this.toHex(color.alpha() * 255) + color.immutableModelObject,
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
    getBorders: function(style) {
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
    getRadius: function(layer){
        if(layer.layers && this.is(layer.layers().firstObject(), MSRectangleShape)){
            return (layer.layers().firstObject().cornerRadiusString().split(';').map(Number).length == 1) ? layer.layers().firstObject().fixedRadius() : layer.layers().firstObject().cornerRadiusString().split(';').map(Number);
        } else if(this.is(layer, MSRectangleShape)) {
            return (layer.cornerRadiusString().split(';').map(Number).length == 1) ? layer.fixedRadius() : layer.cornerRadiusString().split(';').map(Number);
        } else {
            return 0;
        }
    },
    getFills: function(style) {
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
    getShadows: function(style) {
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
    getOpacity: function(style){
        return style.contextSettings().opacity()
    },
    getStyleName: function(layer){
        var styles = (this.is(layer, MSTextLayer))? this.document.documentData().layerTextStyles(): this.document.documentData().layerStyles(),
        layerStyle = layer.style(),
        sharedObjectID = layerStyle.objectID(),
        style;

        styles = styles.objectsSortedByName();

        if(styles.count() > 0){
            style = this.find({key: "(objectID != NULL) && (objectID == %@)", match: sharedObjectID}, styles);
        }

        if(!style) return "";
        return this.toJSString(style.name());
    },
    toHex:function(c) {
        var hex = Math.round(c).toString(16).toUpperCase();
        return hex.length == 1 ? "0" + hex :hex;
    },
});


// getlayer
SM.extend({
    rectToJSON: function(rect, referenceRect) {
        if (referenceRect) {
            return {
                x: Math.round( ( rect.x() - referenceRect.x() ) * 10 ) / 10,
                y: Math.round( ( rect.y() - referenceRect.y() ) * 10 ) / 10,
                width: Math.round( rect.width() * 10 ) / 10,
                height: Math.round( rect.height() * 10 ) / 10
            };
        }

        return {
            x: Math.round( rect.x() * 10 ) / 10,
            y: Math.round( rect.y() * 10 ) / 10,
            width: Math.round( rect.width() * 10 ) / 10,
            height: Math.round( rect.height() * 10 ) / 10
        };
    },
    emojiToEntities: function(str) {
      var self = this,
          emojiRegExp = new RegExp("(?:[\u2700-\u27bf]|(?:\ud83c[\udde6-\uddff]){2}|[\ud800-\udbff][\udc00-\udfff]|[\u0023-\u0039]\ufe0f?\u20e3|\u3299|\u3297|\u303d|\u3030|\u24c2|\ud83c[\udd70-\udd71]|\ud83c[\udd7e-\udd7f]|\ud83c\udd8e|\ud83c[\udd91-\udd9a]|\ud83c[\udde6-\uddff]|[\ud83c[\ude01-\ude02]|\ud83c\ude1a|\ud83c\ude2f|[\ud83c[\ude32-\ude3a]|[\ud83c[\ude50-\ude51]|\u203c|\u2049|[\u25aa-\u25ab]|\u25b6|\u25c0|[\u25fb-\u25fe]|\u00a9|\u00ae|\u2122|\u2139|\ud83c\udc04|[\u2600-\u26FF]|\u2b05|\u2b06|\u2b07|\u2b1b|\u2b1c|\u2b50|\u2b55|\u231a|\u231b|\u2328|\u23cf|[\u23e9-\u23f3]|[\u23f8-\u23fa]|\ud83c\udccf|\u2934|\u2935|[\u2190-\u21ff])", "g");
        return str.replace(
              emojiRegExp,
              function(match) {
                  var u = "";
                  for (var i = 0; i < match.length; i++) {
                      if( !(i%2) ){
                        u += "&#" + match.codePointAt(i)
                      }
                  }

                  return u;
              });
    },
    toHTMLEncode: function(str){
        return this.toJSString(str)
                    .replace(/\</g, "&lt;")
                    .replace(/\>/g, '&gt;')
                    .replace(/\'/g, "&#39;")
                    .replace(/\"/g, "&quot;")
                    .replace(/\u2028/g,"\\u2028")
                    .replace(/\u2029/g,"\\u2029")
                    .replace(/\ud83c|\ud83d/g,"")
                ;
        // return str.replace(/\&/g, "&amp;").replace(/\"/g, "&quot;").replace(/\'/g, "&#39;").replace(/\</g, "&lt;").replace(/\>/g, '&gt;');
    },
    regexNames: /OVERLAY\#|WIDTH\#|HEIGHT\#|TOP\#|RIGHT\#|BOTTOM\#|LEFT\#|VERTICAL\#|HORIZONTAL\#|NOTE\#|PROPERTY\#|LITE\#/,
    isSliceGroup: function(layer) {
        return this.is(layer, MSLayerGroup) && this.hasExportSizes(layer);
    },
    hasExportSizes: function(layer){
        return layer.exportOptions().exportFormats().count() > 0;
    },
    isExportable: function(layer) {
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
    getStates: function(layer){
        var isVisible = true,
            isLocked = false,
            hasSlice = false,
            isEmpty = false,
            isMaskChildLayer = false,
            isMeasure = false,
            isShapeGroup = false;

        while (!( this.is(layer, MSArtboardGroup) || this.is(layer, MSSymbolMaster) ) ) {
            var group = layer.parentGroup();

            if( this.regexNames.exec(group.name()) ){
                isMeasure = true;
            }

            if( this.is(group, MSShapeGroup) ){
                isShapeGroup = true;
            }

            if (!layer.isVisible()) {
                isVisible = false;
            }

            if (layer.isLocked()) {
                isLocked = true;
            }

            if ( this.is(group, MSLayerGroup) && this.hasExportSizes(group) ) {
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
    getLayer: function(artboard, layer, data, symbolLayer){
        var artboardRect = artboard.absoluteRect(),
            group = layer.parentGroup(),
            layerStates = this.getStates(layer);

        if(layer && this.is(layer, MSLayerGroup) && /NOTE\#/.exec(layer.name())){
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
            ( layerStates.isLocked && !this.is(layer, MSSliceLayer) ) ||
            layerStates.isEmpty ||
            layerStates.hasSlice ||
            layerStates.isMeasure ||
            layerStates.isShapeGroup
        ){
            return this;
        }

        var layerType = this.is(layer, MSTextLayer) ? "text" :
               this.is(layer, MSSymbolInstance) ? "symbol" :
               this.is(layer, MSSliceLayer) || this.hasExportSizes(layer)? "slice":
               "shape";

        if ( symbolLayer && layerType == "text" && layer.textBehaviour() == 0) { // fixed for v40
            layer.setTextBehaviour(1); // fixed for v40
            layer.setTextBehaviour(0); // fixed for v40
        } // fixed for v40

        var exportLayerRect;
        if(layerType != "text"){
            // export the influence rect.(include the area of shadows and outside borders...)
            var influenceCGRect = layer.absoluteInfluenceRect();
            exportLayerRect = {
                        x: function(){return influenceCGRect.origin.x;},
                        y: function(){return influenceCGRect.origin.y;},
                        width: function(){return influenceCGRect.size.width;},
                        height: function(){return influenceCGRect.size.height;}
            }
        }
        else{
            // export the default rect.
            exportLayerRect = layer.absoluteRect();
        }

        var layerData = {
                    objectID: this.toJSString( layer.objectID() ),
                    type: layerType,
                    name: this.toHTMLEncode(this.emojiToEntities(layer.name())),
                    rect: this.rectToJSON(exportLayerRect, artboardRect)
                };

        if(symbolLayer) layerData.objectID = this.toJSString( symbolLayer.objectID() );


        if ( layerType != "slice" ) {
            var layerStyle = layer.style();
            layerData.rotation = layer.rotation();
            layerData.radius = this.getRadius(layer);
            layerData.borders = this.getBorders(layerStyle);
            layerData.fills = this.getFills(layerStyle);
            layerData.shadows = this.getShadows(layerStyle);
            layerData.opacity = this.getOpacity(layerStyle);
            layerData.styleName = this.getStyleName(layer);
        }

        if ( layerType == "text" ) {
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

        for(var i = 0; i < layerCSSAttributes.count(); i++) {
            var c = layerCSSAttributes[i]
            if(! /\/\*/.exec(c) ) css.push(this.toJSString(c));
        }
        if(css.length > 0) {
            layerData.css = css;
            if(this.is(layer, MSRectangleShape) && !!layer.fixedRadius()){
                layerData.css.push('border-radius: ' + layer.cornerRadiusString().replace(/;/g,'px ') + 'px;');
            }
        }

        // this.getMask(group, layer, layerData, layerStates);
        // this.getSlice(layer, layerData, symbolLayer);
        // data.layers.push(layerData);
        // this.getSymbol(artboard, layer, layerData, data);
        // this.getText(artboard, layer, layerData, data);
    },
});

export const upload = context => {
    var sketch = require('sketch')

    var document = sketch.getSelectedDocument()
    
    var selectedLayers = document.selectedLayers;
    var selectedCount = selectedLayers.length

        // console.log(template);
    // if (selectedCount === 0) {
    //  console.log('No layers are selected.')
    // } else {
    //     console.log('Selected layers:');
    //     selectedLayers.forEach(function (layer, i) {
    //         // SM.exportImage({
    //         //     layer: layer,
    //         //     path: "/Users/liyi/Documents/保险/new",
    //         //     scale: 1,
    //         //     name: "image1"
    //     // });
    //     slice = MSExportRequest.exportRequestsFromExportableLayer(layer).firstObject();
    //     slice.scale = 1;
    //     var savePathName = "/Users/liyi/Documents/保险/new/1111.png";
    //     document.saveArtboardOrSlice_toFile(slice, savePathName);
    //     })
    // }
    SM.init(context) ;
    SM.export();
};


import * as util from "util"
import * as fs from "fs"
import * as xmlJs from "xml-js"
import * as types from "./types"
import * as paths from "./paths"
import svgo from "./svgo"

const fsReadFile = util.promisify(fs.readFile)

export default async function (
  buildName: types.buildName,
  gameName: string,
  packageName: string,
  fileName: string,
  fileLocalization: null | string,
  audioFormats: types.audioFormat[]
): Promise<{
  [path: string]: {
    readonly type: `audio`
    readonly code: string
    readonly data: {
      readonly [format: string]: string
    }
  } | {
    readonly type: `nonAudio`
    readonly code: string
    readonly data: string
  }
}> {
  console.log(`Reading "${paths.srcGamePackageFile(gameName, packageName, fileName, fileLocalization, `svg`)}"...`)
  const data = await fsReadFile(paths.srcGamePackageFile(gameName, packageName, fileName, fileLocalization, `svg`), { encoding: `utf8` })
  console.log(`Parsing "${paths.srcGamePackageFile(gameName, packageName, fileName, fileLocalization, `svg`)}"...`)
  const xml: xmlJs.Element = xmlJs.xml2js(data) as xmlJs.Element
  if (!xml.elements) {
    throw new Error(`The file contains no elements.`)
  }
  const rootElement = xml
    .elements
    .find(element => element.type == `element` && element.name == `svg`)
  if (!rootElement) {
    throw new Error(`The file contains no root element.`)
  }
  if (!rootElement.elements) {
    throw new Error(`The root element contains no elements.`)
  }
  const elements = rootElement
    .elements
    .filter(element => element.type == `element`)
    .filter(element => element.name && !element.name.startsWith(`sodipodi:`))
    .filter(element => element.name != `metadata`)
  const sharedBetweenLayers = elements.filter(element => element.name == `defs`)
  const layers = elements.filter(element => element.name == `g` && element.attributes && element.attributes[`inkscape:groupmode`] == `layer`)
  const isInkscape = layers.length + sharedBetweenLayers.length == elements.length
  const effectiveLayers: {
    readonly name: string
    readonly xml: xmlJs.Element
  }[] = []
  if (isInkscape && layers.length > 1) {
    console.log(`Splitting "${paths.srcGamePackageFile(gameName, packageName, fileName, fileLocalization, `svg`)}" by Inkscape layer...`)
    layers
      .forEach(layer => {
        const layerXml: xmlJs.Element = JSON.parse(JSON.stringify(xml))

        if (!layer.attributes) {
          throw new Error(`This should never happen, and is required by Typescript.`)
        }

        // Re-shows hidden layers.
        delete layer.attributes.style

        if (!layerXml.elements) {
          throw new Error(`This should never happen, and is required by Typescript.`)
        }

        const layerRootElement = layerXml
          .elements
          .find(element => element.type == `element` && element.name == `svg`)

        if (!layerRootElement) {
          throw new Error(`This should never happen, and is required by Typescript.`)
        }

        layerRootElement.elements = sharedBetweenLayers.concat([layer])

        const layerName = coerceToString(layer.attributes[`inkscape:label`])

        let name = paths.join(fileName, layerName)
        if (layerName == `/`
          || layerName.endsWith(`\\/`)
          || layerName.endsWith(`//`)) {
          name += `//`
        } else if (layerName == `\\`
          || layerName.endsWith(`\\\\`)
          || layerName.endsWith(`/\\`)) {
          name += `/\\`
        }

        effectiveLayers.push({
          name,
          xml: layerXml
        })
      })
  } else {
    if (isInkscape) {
      console.log(`"${paths.srcGamePackageFile(gameName, packageName, fileName, fileLocalization, `svg`)}" is from Inkscape, but has only one layer; it will not be split.`)
    } else {
      console.log(`"${paths.srcGamePackageFile(gameName, packageName, fileName, fileLocalization, `svg`)}" is not from Inkscape; it will not be split.`)
    }
    effectiveLayers.push({
      name: fileName,
      xml
    })
  }

  const generated: {
    [path: string]: {
      readonly type: `nonAudio`
      readonly code: string
      readonly data: string
    }
  } = {}

  for (const layer of effectiveLayers) {
    console.log(`Compressing "${paths.srcGamePackageFile(gameName, packageName, fileName, fileLocalization, `svg`)}" (${Object.keys(generated).length}/${effectiveLayers.length})...`)
    // Workaround for https://github.com/nashwaan/xml-js/issues/69.
    escapeAttributes(layer.xml)

    function escapeAttributes(inXml: xmlJs.Element): void {
      if (inXml.attributes) {
        for (const key in inXml.attributes) {
          inXml.attributes[key] = coerceToString(inXml.attributes[key])
            .replace(`&`, `&amp;`)
            .replace(`<`, `&lt;`)
            .replace(`>`, `&gt;`)
            .replace(`"`, `&quot;`)
            .replace(`'`, `&#39;`)
        }
      }
      if (inXml.elements) {
        inXml.elements.forEach(escapeAttributes)
      }
    }

    const value = await svgo.optimize(xmlJs.js2xml(layer.xml))
    const optimized = xmlJs.xml2js(value.data) as xmlJs.Element
    escapeAttributes(optimized)
    if (!optimized.elements) {
      throw new Error(`This should never happen, and is required by Typescript.`)
    }
    generated[layer.name] = {
      type: `nonAudio`,
      code: `engineSvg`,
      data: optimized.elements.map(element => xmlJs.js2xml(element)).join(``)
    }
  }

  return generated
}

function coerceToString(value: string | number | undefined): string {
  if (value === undefined) {
    return ``
  } else if (typeof value === `string`) {
    return value
  } else {
    return `${value}`
  }
}

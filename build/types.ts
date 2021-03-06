export interface metadata {
  readonly title: string
  readonly description: string
  readonly developer: {
    readonly name: string
    readonly url: string
  }
  readonly width: number
  readonly height: number
  readonly localizations: {
    readonly name: string
    readonly title: string
    readonly description: string
    readonly developer: {
      readonly name: string
      readonly url: string
    }
  }[]
}

export type mutable<T> = { -readonly [P in keyof T]-?: mutable<T[P]> }

export interface state {
  readonly version: number
  readonly paths: {
    readonly [path: string]: number
  }
  readonly games: {
    readonly [name: string]: {
      readonly metadata: metadata
    }
  }
}

export type buildName = `oneOff` | `watch`

export type audioFormat = `none` | `wav` | `mp3` | `ogg`

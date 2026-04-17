declare module 'app-info-parser' {
  export default class AppInfoParser {
    constructor(file: string | Buffer);
    parse(): Promise<Record<string, unknown>>;
  }
}

declare module 'app-info-parser/src/apk' {
  export default class ApkParser {
    constructor(file: string | Buffer);
    parse(): Promise<Record<string, unknown>>;
  }
}

declare module 'app-info-parser/src/ipa' {
  export default class IpaParser {
    constructor(file: string | Buffer);
    parse(): Promise<Record<string, unknown>>;
  }
}

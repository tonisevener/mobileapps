// Ignore these classes for now, just doing some rough modeling
class Article {
    constructor() {
        this.sections = [];
    }
}

class Content {
    constructor(schema, version) {
        this.schema = `${schema}/${version}`;
    }
}

class Section extends Content {
    constructor() {
        super('section', '1.0');
        this.content = [];
    }
    static fromElement(element) {
    }
}

class Paragraph extends Content {
    constructor() {
        super('paragraph', '1.0');
    }
}

class Annotation {
}

class Fact extends Content {
    constructor() {
        super('fact', '1.0');
        this.text = '';
        this.annotations = [];
    }
}

class Infobox extends Content {
}

class Image extends Content {
}

class Quote extends Content {
}

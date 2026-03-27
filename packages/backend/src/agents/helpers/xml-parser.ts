/**
 * XML 解析工具
 * 从 LLM 输出中提取和解析 XML 结构化数据
 */
export class XmlParser {
  /**
   * 从文本中提取指定标签的 XML 内容
   * @param text 包含 XML 的文本
   * @param tagName 要提取的标签名
   * @returns 标签内的内容，如果未找到返回 null
   */
  static extractXmlContent(text: string, tagName: string): string | null {
    // 匹配 <tagName>...</tagName> 或 <tagName />
    const openTag = `<${tagName}`;
    const closeTag = `</${tagName}>`;

    const startIndex = text.indexOf(openTag);
    if (startIndex === -1) {
      return null;
    }

    // 找到标签的开始位置后，需要找到对应的结束位置
    // 处理自闭合标签和带属性的标签
    let tagEnd = text.indexOf('>', startIndex);
    if (tagEnd === -1) {
      return null;
    }

    // 检查是否是自闭合标签 <tag />
    if (text.substring(tagEnd - 1, tagEnd + 1) === '/>') {
      // 自闭合标签，返回空内容
      return '';
    }

    // 找到对应的结束标签
    const endIndex = text.indexOf(closeTag, tagEnd);
    if (endIndex === -1) {
      return null;
    }

    return text.substring(tagEnd + 1, endIndex);
  }

  /**
   * 从文本中提取完整的 XML 元素（包含标签）
   * @param text 包含 XML 的文本
   * @param tagName 要提取的标签名
   * @returns 完整的 XML 元素字符串，如果未找到返回 null
   */
  static extractXmlElement(text: string, tagName: string): string | null {
    const openTag = `<${tagName}`;
    const closeTag = `</${tagName}>`;

    const startIndex = text.indexOf(openTag);
    if (startIndex === -1) {
      return null;
    }

    // 找到标签的开始位置
    let tagEnd = text.indexOf('>', startIndex);
    if (tagEnd === -1) {
      return null;
    }

    // 检查是否是自闭合标签
    if (text.substring(tagEnd - 1, tagEnd + 1) === '/>') {
      return text.substring(startIndex, tagEnd + 1);
    }

    // 找到对应的结束标签
    const endIndex = text.indexOf(closeTag, tagEnd);
    if (endIndex === -1) {
      return null;
    }

    return text.substring(startIndex, endIndex + closeTag.length);
  }

  /**
   * 将 XML 字符串转换为 JavaScript 对象
   * 支持嵌套结构和数组
   * @param xml XML 字符串
   * @returns 解析后的对象
   */
  static parseToObject(xml: string): Record<string, any> {
    const result: Record<string, any> = {};

    // 处理空字符串
    if (!xml || xml.trim() === '') {
      return result;
    }

    // 使用正则表达式匹配所有直接子元素
    // 匹配模式：<tagName ...>content</tagName> 或 <tagName ... />
    const tagPattern = /<(\w+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>|<(\w+)(?:\s[^>]*)?\/>/g;

    let match: RegExpExecArray | null;
    const tagCounts: Record<string, number> = {};

    // 先计算每个标签出现的次数
    const tempPattern = /<(\w+)(?:\s[^>]*)?>(?:[\s\S]*?)<\/\1>|<(\w+)(?:\s[^>]*)?\/>/g;
    let tempMatch: RegExpExecArray | null;
    while ((tempMatch = tempPattern.exec(xml)) !== null) {
      const tagName = tempMatch[1] || tempMatch[3];
      tagCounts[tagName] = (tagCounts[tagName] || 0) + 1;
    }

    // 重置正则表达式
    tagPattern.lastIndex = 0;

    while ((match = tagPattern.exec(xml)) !== null) {
      const tagName = match[1] || match[3];
      const content = match[2] || '';

      // 解析内容
      let value: any;

      // 检查内容是否包含子元素
      if (/<\w+/.test(content)) {
        // 有子元素，递归解析
        value = this.parseToObject(content);
      } else {
        // 没有子元素，处理文本内容
        value = this.parseTextContent(content);
      }

      // 处理数组
      if (tagCounts[tagName] > 1) {
        if (!result[tagName]) {
          result[tagName] = [];
        }
        if (Array.isArray(result[tagName])) {
          result[tagName].push(value);
        }
      } else {
        result[tagName] = value;
      }
    }

    return result;
  }

  /**
   * 解析文本内容
   * 尝试转换为合适的类型（数字、布尔值、字符串）
   */
  private static parseTextContent(content: string): any {
    const trimmed = content.trim();

    // 空内容
    if (trimmed === '') {
      return '';
    }

    // 布尔值
    if (trimmed.toLowerCase() === 'true') {
      return true;
    }
    if (trimmed.toLowerCase() === 'false') {
      return false;
    }

    // 数字
    const num = Number(trimmed);
    if (!isNaN(num) && trimmed !== '') {
      return num;
    }

    // 字符串
    return trimmed;
  }

  /**
   * 从 CLI 输出中解析 XML
   * 支持 NDJSON 格式的 CLI 输出
   * @param output CLI 输出字符串
   * @param tagName 要提取的 XML 标签名
   * @returns 解析后的对象，如果未找到返回 null
   */
  static parseFromCliOutput(output: string, tagName: string): Record<string, any> | null {
    if (!output) {
      return null;
    }

    // 首先尝试从 NDJSON 格式中提取文本内容
    const extractedText = this.extractTextFromCliOutput(output);

    // 查找 XML 标签
    const xmlContent = this.extractXmlContent(extractedText, tagName);
    if (xmlContent === null) {
      return null;
    }

    // 解析 XML 为对象
    return this.parseToObject(xmlContent);
  }

  /**
   * 从 CLI 输出中提取文本内容
   * 处理 JSON 格式的输出，提取 result[0].text 或 assistant.message.content
   */
  private static extractTextFromCliOutput(output: string): string {
    // 尝试解析为 NDJSON 格式
    const lines = output.split('\n').filter(line => line.trim());

    // 收集所有文本内容
    let allText = '';

    for (const line of lines) {
      try {
        const json = JSON.parse(line);

        // 处理 result 类型消息
        if (json.type === 'result' && Array.isArray(json.result)) {
          for (const item of json.result) {
            if (item.type === 'text' && item.text) {
              allText += item.text + '\n';
            }
          }
        }

        // 处理 assistant 类型消息
        if (json.type === 'assistant' && json.message?.content) {
          for (const block of json.message.content) {
            if (block.type === 'text' && block.text) {
              allText += block.text + '\n';
            }
          }
        }
      } catch {
        // 不是 JSON，可能是纯文本，直接追加
        allText += line + '\n';
      }
    }

    // 如果没有提取到文本，返回原始输出
    return allText || output;
  }

  /**
   * 检查文本中是否包含指定的 XML 标签
   * @param text 要检查的文本
   * @param tagName 标签名
   * @returns 是否包含该标签
   */
  static hasXmlTag(text: string, tagName: string): boolean {
    return text.includes(`<${tagName}`) && text.includes(`</${tagName}>`);
  }

  /**
   * 检查文本中是否包含未闭合的 XML 标签
   * 用于流式输出时判断是否在隐藏块中
   * @param text 要检查的文本
   * @param tagName 标签名
   * @returns true 表示在标签内部（未闭合），false 表示不在或已闭合
   */
  static isInOpenTag(text: string, tagName: string): boolean {
    const openPattern = `<${tagName}`;
    const closePattern = `</${tagName}>`;

    const lastOpen = text.lastIndexOf(openPattern);
    const lastClose = text.lastIndexOf(closePattern);

    // 如果有开始标签但没有结束标签，或者开始标签在结束标签之后
    if (lastOpen !== -1 && (lastClose === -1 || lastOpen > lastClose)) {
      return true;
    }

    return false;
  }
}
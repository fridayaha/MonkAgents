import { XmlParser } from './xml-parser';

describe('XmlParser', () => {
  describe('extractXmlContent', () => {
    it('should extract content from XML tag', () => {
      const text = 'Some text <test>content here</test> more text';
      const result = XmlParser.extractXmlContent(text, 'test');
      expect(result).toBe('content here');
    });

    it('should return null if tag not found', () => {
      const text = 'Some text without the tag';
      const result = XmlParser.extractXmlContent(text, 'test');
      expect(result).toBeNull();
    });

    it('should handle nested tags', () => {
      const text = '<outer><inner>value</inner></outer>';
      const result = XmlParser.extractXmlContent(text, 'outer');
      expect(result).toBe('<inner>value</inner>');
    });

    it('should handle self-closing tags', () => {
      const text = '<test />';
      const result = XmlParser.extractXmlContent(text, 'test');
      expect(result).toBe('');
    });
  });

  describe('parseToObject', () => {
    it('should parse simple XML to object', () => {
      const xml = '<name>test</name><value>123</value>';
      const result = XmlParser.parseToObject(xml);
      expect(result).toEqual({
        name: 'test',
        value: 123,
      });
    });

    it('should parse nested XML', () => {
      const xml = '<person><name>John</name><age>30</age></person>';
      const result = XmlParser.parseToObject(xml);
      expect(result).toEqual({
        person: {
          name: 'John',
          age: 30,
        },
      });
    });

    it('should parse arrays', () => {
      const xml = '<items><item>a</item><item>b</item><item>c</item></items>';
      const result = XmlParser.parseToObject(xml);
      expect(result).toEqual({
        items: {
          item: ['a', 'b', 'c'],
        },
      });
    });

    it('should parse boolean values', () => {
      const xml = '<active>true</active><deleted>false</deleted>';
      const result = XmlParser.parseToObject(xml);
      expect(result).toEqual({
        active: true,
        deleted: false,
      });
    });

    it('should parse numeric values', () => {
      const xml = '<count>42</count><price>99.99</price>';
      const result = XmlParser.parseToObject(xml);
      expect(result).toEqual({
        count: 42,
        price: 99.99,
      });
    });

    it('should handle empty string', () => {
      const result = XmlParser.parseToObject('');
      expect(result).toEqual({});
    });

    it('should handle whitespace', () => {
      const xml = '  <name>  test  </name>  ';
      const result = XmlParser.parseToObject(xml);
      expect(result).toEqual({
        name: 'test',
      });
    });
  });

  describe('parseFromCliOutput', () => {
    it('should parse XML from plain text output', () => {
      const output = 'Some text before\n<task_plan>\n<type>task</type>\n</task_plan>\nSome text after';
      const result = XmlParser.parseFromCliOutput(output, 'task_plan');
      expect(result).toEqual({
        type: 'task',
      });
    });

    it('should parse XML from NDJSON output', () => {
      const output = JSON.stringify({
        type: 'result',
        result: [{ type: 'text', text: '<execution_summary>\n<status>completed</status>\n</execution_summary>' }],
      });
      const result = XmlParser.parseFromCliOutput(output, 'execution_summary');
      expect(result).toEqual({
        status: 'completed',
      });
    });

    it('should return null if XML not found', () => {
      const output = 'Plain text without XML';
      const result = XmlParser.parseFromCliOutput(output, 'task_plan');
      expect(result).toBeNull();
    });

    it('should handle null output', () => {
      const result = XmlParser.parseFromCliOutput(null as any, 'test');
      expect(result).toBeNull();
    });
  });

  describe('hasXmlTag', () => {
    it('should return true if tag exists', () => {
      const text = 'Some text <test>content</test>';
      expect(XmlParser.hasXmlTag(text, 'test')).toBe(true);
    });

    it('should return false if tag not exists', () => {
      const text = 'Some text without the tag';
      expect(XmlParser.hasXmlTag(text, 'test')).toBe(false);
    });
  });

  describe('isInOpenTag', () => {
    it('should return true if inside open tag', () => {
      const text = 'Some text <test>content here';
      expect(XmlParser.isInOpenTag(text, 'test')).toBe(true);
    });

    it('should return false if tag is closed', () => {
      const text = 'Some text <test>content</test>';
      expect(XmlParser.isInOpenTag(text, 'test')).toBe(false);
    });

    it('should return false if tag not found', () => {
      const text = 'Some text without the tag';
      expect(XmlParser.isInOpenTag(text, 'test')).toBe(false);
    });
  });

  describe('execution_summary XML parsing', () => {
    it('should parse complete execution_summary XML', () => {
      const xml = `<status>completed</status>
        <outputs>
          <output>
            <type>file</type>
            <description>创建了登录页面</description>
            <filePath>src/pages/login.tsx</filePath>
          </output>
        </outputs>
        <suggestions>
          <suggestion>
            <targetAgent>shaseng</targetAgent>
            <task>审查登录页面代码质量</task>
            <reason>代码创建完成，需要质量检查</reason>
          </suggestion>
        </suggestions>`;

      const result = XmlParser.parseToObject(xml);
      expect(result.status).toBe('completed');
      expect(result.outputs.output.type).toBe('file');
      expect(result.suggestions.suggestion.targetAgent).toBe('shaseng');
    });
  });

  describe('task_plan XML parsing', () => {
    it('should parse task_plan XML with steps', () => {
      const xml = `<type>task</type>
        <analysis>用户需要实现登录功能</analysis>
        <steps>
          <step>
            <stepId>1</stepId>
            <taskName>实现登录页面</taskName>
            <agentRole>wukong</agentRole>
            <taskDetail>创建登录页面组件</taskDetail>
            <dependencies></dependencies>
            <priority>high</priority>
          </step>
          <step>
            <stepId>2</stepId>
            <taskName>审查代码</taskName>
            <agentRole>shaseng</agentRole>
            <taskDetail>审查登录页面代码质量</taskDetail>
            <dependencies>1</dependencies>
            <priority>medium</priority>
          </step>
        </steps>
        <summary>登录功能开发流程</summary>
        <needsHelp>false</needsHelp>`;

      const result = XmlParser.parseToObject(xml);
      expect(result.type).toBe('task');
      expect(result.analysis).toBe('用户需要实现登录功能');
      expect(Array.isArray(result.steps.step)).toBe(true);
      expect(result.steps.step[0].taskName).toBe('实现登录页面');
    });

    it('should parse chat mode task_plan', () => {
      const xml = `<type>chat</type>
        <analysis>用户打招呼</analysis>
        <chatTopic>日常问候</chatTopic>
        <chatResponders>
          <responder>
            <agentRole>tangseng</agentRole>
            <reason>团队协调者，应该首先回应</reason>
            <topic>表示欢迎</topic>
          </responder>
          <responder>
            <agentRole>wukong</agentRole>
            <reason>活跃气氛</reason>
            <topic>热情问候</topic>
          </responder>
        </chatResponders>
        <summary>问候消息</summary>
        <needsHelp>false</needsHelp>`;

      const result = XmlParser.parseToObject(xml);
      expect(result.type).toBe('chat');
      expect(result.chatTopic).toBe('日常问候');
      expect(Array.isArray(result.chatResponders.responder)).toBe(true);
      expect(result.chatResponders.responder.length).toBe(2);
    });
  });
});
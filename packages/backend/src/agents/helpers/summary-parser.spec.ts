import { SummaryParser } from './summary-parser';

describe('SummaryParser', () => {
  describe('parse XML format', () => {
    it('should parse XML execution_summary', () => {
      const output = `<execution_summary>
        <status>completed</status>
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
        </suggestions>
      </execution_summary>`;

      const result = SummaryParser.parse(output);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
      expect(result!.outputs).toHaveLength(1);
      expect(result!.outputs[0].type).toBe('file');
      expect(result!.outputs[0].description).toBe('创建了登录页面');
      expect(result!.suggestions).toHaveLength(1);
      expect(result!.suggestions![0].targetAgent).toBe('shaseng');
    });

    it('should parse XML with multiple outputs', () => {
      const output = `<execution_summary>
        <status>completed</status>
        <outputs>
          <output>
            <type>file</type>
            <description>创建了组件A</description>
            <filePath>src/A.tsx</filePath>
          </output>
          <output>
            <type>file</type>
            <description>创建了组件B</description>
            <filePath>src/B.tsx</filePath>
          </output>
        </outputs>
      </execution_summary>`;

      const result = SummaryParser.parse(output);
      expect(result).not.toBeNull();
      expect(result!.outputs).toHaveLength(2);
    });

    it('should parse XML with issues', () => {
      const output = `<execution_summary>
        <status>partial</status>
        <issues>
          <issue>
            <type>warning</type>
            <description>未处理的边界情况</description>
          </issue>
          <issue>
            <type>error</type>
            <description>缺少必要的错误处理</description>
          </issue>
        </issues>
      </execution_summary>`;

      const result = SummaryParser.parse(output);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('partial');
      expect(result!.issues).toHaveLength(2);
      expect(result!.issues![0].type).toBe('warning');
      expect(result!.issues![1].type).toBe('error');
    });

    it('should parse XML from CLI NDJSON output', () => {
      const output = JSON.stringify({
        type: 'result',
        result: [{
          type: 'text',
          text: `Task completed!\n<execution_summary>\n<status>completed</status>\n<outputs>\n<output>\n<type>file</type>\n<description>修复了bug</description>\n<filePath>src/utils.ts</filePath>\n</output>\n</outputs>\n</execution_summary>`,
        }],
      });

      const result = SummaryParser.parse(output);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
      expect(result!.outputs).toHaveLength(1);
    });
  });

  describe('parse JSON format (backward compatibility)', () => {
    it('should parse JSON execution_summary code block', () => {
      // 直接使用反引号字符串
      const output = '```execution_summary\n{"status": "completed", "outputs": [{"type": "file", "description": "创建了登录页面", "filePath": "src/pages/login.tsx"}], "suggestions": [{"targetAgent": "shaseng", "task": "审查代码", "reason": "需要质量检查"}]}\n```';

      const result = SummaryParser.parse(output);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
      expect(result!.outputs).toHaveLength(1);
      expect(result!.suggestions).toHaveLength(1);
    });

    it('should parse JSON from CLI output', () => {
      const output = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{
            type: 'text',
            text: '任务完成！\n```execution_summary\n{"status": "completed", "outputs": []}\n```',
          }],
        },
      });

      const result = SummaryParser.parse(output);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
    });
  });

  describe('edge cases', () => {
    it('should return null for empty output', () => {
      const result = SummaryParser.parse('');
      expect(result).toBeNull();
    });

    it('should return null for null output', () => {
      const result = SummaryParser.parse(null as any);
      expect(result).toBeNull();
    });

    it('should return null for output without summary', () => {
      const result = SummaryParser.parse('Just some regular text without summary');
      expect(result).toBeNull();
    });

    it('should normalize invalid status to completed', () => {
      const output = `<execution_summary>
        <status>invalid_status</status>
        <outputs></outputs>
      </execution_summary>`;

      const result = SummaryParser.parse(output);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
    });

    it('should normalize invalid agent to wukong', () => {
      const output = `<execution_summary>
        <status>completed</status>
        <outputs></outputs>
        <suggestions>
          <suggestion>
            <targetAgent>invalid_agent</targetAgent>
            <task>some task</task>
            <reason>reason</reason>
          </suggestion>
        </suggestions>
      </execution_summary>`;

      const result = SummaryParser.parse(output);
      expect(result).not.toBeNull();
      expect(result!.suggestions![0].targetAgent).toBe('wukong');
    });
  });

  describe('generateDefault', () => {
    it('should generate default summary', () => {
      const result = SummaryParser.generateDefault('completed');
      expect(result.status).toBe('completed');
      expect(result.outputs).toEqual([]);
      expect(result.filesChanged).toEqual([]);
    });
  });

  describe('hasHandoffSuggestion', () => {
    it('should return true if has suggestions', () => {
      const summary = {
        status: 'completed' as const,
        outputs: [],
        filesChanged: [],
        timestamp: new Date(),
        suggestions: [{ targetAgent: 'wukong' as const, task: 'test', reason: '', priority: 'medium' as const }],
      };
      expect(SummaryParser.hasHandoffSuggestion(summary)).toBe(true);
    });

    it('should return false if no suggestions', () => {
      const summary = {
        status: 'completed' as const,
        outputs: [],
        filesChanged: [],
        timestamp: new Date(),
      };
      expect(SummaryParser.hasHandoffSuggestion(summary)).toBe(false);
    });

    it('should return false for null summary', () => {
      expect(SummaryParser.hasHandoffSuggestion(null)).toBe(false);
    });
  });

  describe('getFirstHandoffSuggestion', () => {
    it('should return first suggestion', () => {
      const summary = {
        status: 'completed' as const,
        outputs: [],
        filesChanged: [],
        timestamp: new Date(),
        suggestions: [{ targetAgent: 'wukong' as const, task: 'task1', reason: '', priority: 'medium' as const }],
      };
      const result = SummaryParser.getFirstHandoffSuggestion(summary);
      expect(result).not.toBeNull();
      expect(result!.task).toBe('task1');
    });

    it('should return null for no suggestions', () => {
      const summary = {
        status: 'completed' as const,
        outputs: [],
        filesChanged: [],
        timestamp: new Date(),
      };
      expect(SummaryParser.getFirstHandoffSuggestion(summary)).toBeNull();
    });
  });
});
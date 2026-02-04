import { useState, useRef, useEffect, useCallback } from 'react';
import './ChatAgent.css';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
  toolCalls?: Array<{
    name: string;
    result: unknown;
  }>;
}

interface Tool {
  name: string;
  description: string;
}

interface Agent {
  name: string;
  displayName: string;
  description: string;
}

interface ActiveAgent {
  name: string;
  status: string;
  task?: string;
}

interface ToolsResponse {
  mcpTools: string[];
  skills: string[];
  agentTools?: string[];
  allTools: Tool[];
  mcpStatus?: Record<string, string>;
}

interface AgentsResponse {
  agents: Agent[];
  activeAgent: ActiveAgent | null;
}

export default function ChatAgent() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [tools, setTools] = useState<ToolsResponse>({
    mcpTools: [],
    skills: [],
    agentTools: [],
    allTools: []
  });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeAgent, setActiveAgent] = useState<ActiveAgent | null>(null);
  const [mcpStatus, setMcpStatus] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 获取可用工具
  useEffect(() => {
    fetch('http://localhost:3001/api/tools')
      .then(res => res.json())
      .then((data: ToolsResponse) => {
        setTools(data);
        if (data.mcpStatus) {
          setMcpStatus(data.mcpStatus);
        }
      })
      .catch(err => console.error('获取工具列表失败:', err));
  }, []);

  // 获取 Agent 列表
  useEffect(() => {
    fetch('http://localhost:3001/api/agents')
      .then(res => res.json())
      .then((data: AgentsResponse) => {
        setAgents(data.agents);
        setActiveAgent(data.activeAgent);
      })
      .catch(err => console.error('获取 Agent 列表失败:', err));
  }, []);

  // 轮询活跃 Agent 状态
  useEffect(() => {
    if (!isLoading) return;

    const interval = setInterval(() => {
      fetch('http://localhost:3001/api/agents/active')
        .then(res => res.json())
        .then((data: { activeAgent: ActiveAgent | null }) => {
          setActiveAgent(data.activeAgent);
        })
        .catch(() => {});
    }, 1000);

    return () => clearInterval(interval);
  }, [isLoading]);

  // 发送消息
  const handleSendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('请求失败');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';
      let toolCalls: Array<{ name: string; result: unknown }> = [];

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  assistantMessage += parsed.text;
                  setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];

                    if (lastMessage && lastMessage.role === 'assistant') {
                      lastMessage.content = assistantMessage;
                      lastMessage.toolCalls = toolCalls.length > 0 ? toolCalls : undefined;
                    } else {
                      newMessages.push({
                        role: 'assistant',
                        content: assistantMessage,
                        timestamp: new Date(),
                        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
                      });
                    }
                    return newMessages;
                  });
                }
                if (parsed.toolCalls) {
                  toolCalls = parsed.toolCalls;
                  setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    if (lastMessage && lastMessage.role === 'assistant') {
                      lastMessage.toolCalls = toolCalls;
                    }
                    return [...newMessages];
                  });
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('发送消息错误:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '抱歉，发生了错误。请确保后端服务正在运行。',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
      setActiveAgent(null);
    }
  }, [input, isLoading, messages]);

  // 处理键盘事件
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // 清空对话
  const handleClear = () => {
    setMessages([]);
  };

  // 获取状态颜色
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected': return '#28a745';
      case 'working': return '#ffc107';
      case 'coordinating': return '#17a2b8';
      case 'completed': return '#28a745';
      case 'error': return '#dc3545';
      default: return '#6c757d';
    }
  };

  return (
    <div className="chat-agent">
      <div className="chat-header">
        <h1>AI Chat Agent</h1>
        <div className="tools-info">
          <span className="tool-badge">MCP: {tools.mcpTools.length}</span>
          <span className="tool-badge">Skills: {tools.skills.length}</span>
          <span className="tool-badge">Agents: {agents.length}</span>
          <button onClick={handleClear} className="clear-btn">清空对话</button>
        </div>
      </div>

      {/* 活跃 Agent 状态指示器 */}
      {activeAgent && (
        <div className="active-agent-bar">
          <div className="agent-status-indicator" style={{ backgroundColor: getStatusColor(activeAgent.status) }} />
          <span className="agent-name">{activeAgent.name}</span>
          <span className="agent-status">{activeAgent.status}</span>
          {activeAgent.task && (
            <span className="agent-task">{activeAgent.task.substring(0, 50)}...</span>
          )}
        </div>
      )}

      <div className="tools-panel">
        <details>
          <summary>可用工具与 Agent ({tools.allTools.length})</summary>
          <div className="tools-list">
            <div className="tools-section">
              <h3>MCP 工具</h3>
              <ul>
                {tools.mcpTools.map(tool => (
                  <li key={tool}>
                    {tool}
                    {mcpStatus[tool] && (
                      <span
                        className="status-dot"
                        style={{ backgroundColor: getStatusColor(mcpStatus[tool]) }}
                        title={mcpStatus[tool]}
                      />
                    )}
                  </li>
                ))}
              </ul>
              {Object.keys(mcpStatus).length > 0 && (
                <div className="mcp-status">
                  MCP 状态: {Object.entries(mcpStatus).map(([name, status]) => (
                    <span key={name} className="mcp-status-item">
                      <span
                        className="status-dot"
                        style={{ backgroundColor: getStatusColor(status) }}
                      />
                      {name}: {status}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="tools-section">
              <h3>Skills</h3>
              <ul>
                {tools.skills.map(skill => (
                  <li key={skill}>{skill}</li>
                ))}
              </ul>
            </div>
            <div className="tools-section agents-section">
              <h3>专业 Agent</h3>
              <ul>
                {agents.map(agent => (
                  <li key={agent.name} className="agent-item">
                    <strong>{agent.displayName}</strong>
                    <span className="agent-desc">{agent.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="welcome-message">
            <h2>欢迎使用 AI Chat Agent</h2>
            <p>我可以帮助你:</p>
            <ul>
              <li>使用 MCP 工具操作文件和代码</li>
              <li>使用预定义 Skills 分析和优化代码</li>
              <li>调用专业 Agent 完成复杂任务</li>
              <li>多 Agent 协作处理综合性问题</li>
            </ul>
            <div className="quick-actions">
              <p>快速示例:</p>
              <button onClick={() => setInput('列出 src 目录下的所有文件')}>
                列出目录
              </button>
              <button onClick={() => setInput('分析 src/server.ts 的代码质量')}>
                分析代码
              </button>
              <button onClick={() => setInput('帮我审查代码并给出优化建议')}>
                多 Agent 协作
              </button>
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div key={index} className={`message ${message.role}`}>
              <div className="message-header">
                <span className="message-role">
                  {message.role === 'user' ? '你' : '助手'}
                </span>
                {message.timestamp && (
                  <span className="message-time">
                    {message.timestamp.toLocaleTimeString()}
                  </span>
                )}
              </div>
              <div className="message-content">{message.content}</div>
              {message.toolCalls && message.toolCalls.length > 0 && (
                <div className="tool-calls">
                  <details>
                    <summary>工具调用 ({message.toolCalls.length})</summary>
                    <ul>
                      {message.toolCalls.map((tc, i) => (
                        <li key={i}>
                          <strong>{tc.name}</strong>
                          <pre>{JSON.stringify(tc.result, null, 2)}</pre>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              )}
            </div>
          ))
        )}
        {isLoading && (
          <div className="message assistant loading">
            <div className="message-header">
              <span className="message-role">助手</span>
              {activeAgent && (
                <span className="active-agent-badge">
                  {activeAgent.name} - {activeAgent.status}
                </span>
              )}
            </div>
            <div className="message-content">
              <span className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          rows={3}
          disabled={isLoading}
        />
        <button
          className="send-button"
          onClick={handleSendMessage}
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? '发送中...' : '发送'}
        </button>
      </div>
    </div>
  );
}

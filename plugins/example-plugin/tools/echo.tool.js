const { DynamicStructuredTool } = require('@langchain/core/tools');
const { z } = require('zod');

module.exports = function createEchoTool() {
  return new DynamicStructuredTool({
    name: 'echo',
    description: 'Echo back the input message. Useful for testing plugin tools.',
    schema: z.object({
      message: z.string().describe('The message to echo back.'),
    }),
    func: async ({ message }) => {
      return `Echo: ${message}`;
    },
  });
};

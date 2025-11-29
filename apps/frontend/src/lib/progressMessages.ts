export interface ProgressMessage {
  id: number;
  type: 'ai' | 'task';
  content: string;
  status: 'complete' | 'active' | 'pending';
}

export function getProgressMessages(progress: number, state: string): ProgressMessage[] {
  const messages: ProgressMessage[] = [];
  let id = 1;

  if (progress >= 10) {
    messages.push({
      id: id++,
      type: 'task',
      content: 'Creating isolated sandbox environment',
      status: 'complete'
    });
  }

  if (progress >= 20) {
    messages.push({
      id: id++,
      type: 'task',
      content: 'Cloning repository and analyzing codebase',
      status: 'complete'
    });
  }

  if (progress >= 30) {
    messages.push({
      id: id++,
      type: 'ai',
      content: 'Detecting package manager and dependencies',
      status: 'complete'
    });
  }

  if (progress >= 40) {
    messages.push({
      id: id++,
      type: 'ai',
      content: 'Searching for relevant files using hybrid search (BM25 + Vector)',
      status: 'complete'
    });
  }

  if (progress >= 50) {
    messages.push({
      id: id++,
      type: 'task',
      content: 'Building code graph and analyzing dependencies',
      status: 'complete'
    });
  }

  if (progress >= 60) {
    messages.push({
      id: id++,
      type: 'ai',
      content: 'Selecting files to modify based on your task',
      status: 'complete'
    });
  }

  if (progress >= 70) {
    messages.push({
      id: id++,
      type: 'ai',
      content: 'Generating code changes with AI validation loop',
      status: progress >= 90 ? 'complete' : 'active'
    });
  }

  if (progress >= 90) {
    messages.push({
      id: id++,
      type: 'task',
      content: 'Validating code changes (syntax, types, tests)',
      status: progress >= 95 ? 'complete' : 'active'
    });
  }

  if (progress >= 95) {
    messages.push({
      id: id++,
      type: 'task',
      content: 'Committing changes and creating pull request',
      status: state === 'completed' ? 'complete' : 'active'
    });
  }

  if (state === 'completed') {
    messages.push({
      id: id++,
      type: 'ai',
      content: 'Pull request created successfully! Review the changes in the diff tab.',
      status: 'complete'
    });
  }

  if (state === 'failed') {
    messages.push({
      id: id++,
      type: 'ai',
      content: 'Job failed. Please check the logs and try again.',
      status: 'complete'
    });
  }

  return messages;
}

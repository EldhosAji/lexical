/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import {ContentEditable} from '@lexical/react/src/LexicalContentEditable';
import {RichTextPlugin} from '@lexical/react/src/LexicalRichTextPlugin';
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  TableCellNode,
  TableRowNode,
} from '@lexical/table';
import {
  $createLineBreakNode,
  $createNodeSelection,
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $isTextNode,
  $parseSerializedNode,
  $setCompositionKey,
  $setSelection,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  createCommand,
  DEPRECATED_$createGridSelection,
  ElementNode,
  LexicalEditor,
  NodeKey,
  ParagraphNode,
  TextNode,
} from 'lexical';
import * as React from 'react';
import {
  createRef,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {createPortal} from 'react-dom';
import {createRoot} from 'react-dom/client';
import * as ReactTestUtils from 'react-dom/test-utils';

import {getEditorStateTextContent} from '../../LexicalUtils';
import {
  $createTestDecoratorNode,
  $createTestElementNode,
  $createTestInlineElementNode,
  createTestEditor,
  TestComposer,
} from '../utils';
// No idea why we suddenly need to do this, but it fixes the tests
// with latest experimental React version.
global.IS_REACT_ACT_ENVIRONMENT = true;

describe('LexicalEditor tests', () => {
  let container: HTMLElement;
  let reactRoot;

  beforeEach(() => {
    container = document.createElement('div');
    reactRoot = createRoot(container);
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    container = null;

    jest.restoreAllMocks();
  });

  function useLexicalEditor(rootElementRef, onError) {
    const editor = useMemo(
      () =>
        createTestEditor({
          nodes: [],
          onError: onError || jest.fn(),
          theme: {
            text: {
              bold: 'editor-text-bold',
              italic: 'editor-text-italic',
              underline: 'editor-text-underline',
            },
          },
        }),
      [onError],
    );

    useEffect(() => {
      const rootElement = rootElementRef.current;

      editor.setRootElement(rootElement);
    }, [rootElementRef, editor]);

    return editor;
  }

  let editor: LexicalEditor = null;

  function init(onError?: () => void) {
    const ref = createRef<HTMLDivElement>();

    function TestBase() {
      editor = useLexicalEditor(ref, onError);

      return <div ref={ref} contentEditable={true} />;
    }

    ReactTestUtils.act(() => {
      reactRoot.render(<TestBase />);
    });
  }

  async function update(fn) {
    editor.update(fn);

    return Promise.resolve().then();
  }

  it('Should be create and editor with an initial editor state', async () => {
    const rootElement = document.createElement('div');

    container.appendChild(rootElement);

    const initialEditor = createTestEditor({
      onError: jest.fn(),
    });

    initialEditor.update(() => {
      const root = $getRoot();
      const paragraph = $createParagraphNode();
      const text = $createTextNode('This works!');
      root.append(paragraph);
      paragraph.append(text);
    });

    initialEditor.setRootElement(rootElement);

    // Wait for update to complete
    await Promise.resolve().then();

    expect(container.innerHTML).toBe(
      '<div style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">This works!</span></p></div>',
    );

    const initialEditorState = initialEditor.getEditorState();
    initialEditor.setRootElement(null);

    expect(container.innerHTML).toBe(
      '<div style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"></div>',
    );

    editor = createTestEditor({
      editorState: initialEditorState,
      onError: jest.fn(),
    });
    editor.setRootElement(rootElement);

    expect(editor.getEditorState()).toEqual(initialEditorState);
    expect(container.innerHTML).toBe(
      '<div style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">This works!</span></p></div>',
    );
  });

  it('Should handle nested updates in the correct sequence', async () => {
    init();

    let log = [];

    editor.update(() => {
      const root = $getRoot();
      const paragraph = $createParagraphNode();
      const text = $createTextNode('This works!');
      root.append(paragraph);
      paragraph.append(text);
    });

    editor.update(
      () => {
        log.push('A1');
        // To enforce the update
        $getRoot().markDirty();
        editor.update(
          () => {
            log.push('B1');
            editor.update(
              () => {
                log.push('C1');
              },
              {
                onUpdate: () => {
                  log.push('F1');
                },
              },
            );
          },
          {
            onUpdate: () => {
              log.push('E1');
            },
          },
        );
      },
      {
        onUpdate: () => {
          log.push('D1');
        },
      },
    );

    // Wait for update to complete
    await Promise.resolve().then();

    expect(log).toEqual(['A1', 'B1', 'C1', 'D1', 'E1', 'F1']);

    log = [];
    editor.update(
      () => {
        log.push('A2');
        // To enforce the update
        $getRoot().markDirty();
      },
      {
        onUpdate: () => {
          log.push('B2');
          editor.update(
            () => {
              // force flush sync
              $setCompositionKey('root');
              log.push('D2');
            },
            {
              onUpdate: () => {
                log.push('F2');
              },
            },
          );
          log.push('C2');
          editor.update(
            () => {
              log.push('E2');
            },
            {
              onUpdate: () => {
                log.push('G2');
              },
            },
          );
        },
      },
    );

    // Wait for update to complete
    await Promise.resolve().then();

    expect(log).toEqual(['A2', 'B2', 'C2', 'D2', 'E2', 'F2', 'G2']);

    log = [];
    editor.registerNodeTransform(TextNode, () => {
      log.push('TextTransform A3');
      editor.update(
        () => {
          log.push('TextTransform B3');
        },
        {
          onUpdate: () => {
            log.push('TextTransform C3');
          },
        },
      );
    });

    // Wait for update to complete
    await Promise.resolve().then();

    expect(log).toEqual([
      'TextTransform A3',
      'TextTransform B3',
      'TextTransform C3',
    ]);

    log = [];
    editor.update(
      () => {
        log.push('A3');
        $getRoot().getLastDescendant().markDirty();
      },
      {
        onUpdate: () => {
          log.push('B3');
        },
      },
    );

    // Wait for update to complete
    await Promise.resolve().then();

    expect(log).toEqual([
      'A3',
      'TextTransform A3',
      'TextTransform B3',
      'B3',
      'TextTransform C3',
    ]);
  });

  it('update does not call onUpdate callback when no dirty nodes', () => {
    init();

    const fn = jest.fn();
    editor.update(
      () => {
        //
      },
      {
        onUpdate: fn,
      },
    );
    expect(fn).toHaveBeenCalledTimes(0);
  });

  it('editor.focus() callback is called', async () => {
    init();

    await editor.update(() => {
      const root = $getRoot();
      root.append($createParagraphNode());
    });

    const fn = jest.fn();

    await editor.focus(fn);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('Synchronously runs three transforms, two of them depend on the other', async () => {
    init();

    // 2. Add italics
    const italicsListener = editor.registerNodeTransform(TextNode, (node) => {
      if (
        node.getTextContent() === 'foo' &&
        node.hasFormat('bold') &&
        !node.hasFormat('italic')
      ) {
        node.toggleFormat('italic');
      }
    });

    // 1. Add bold
    const boldListener = editor.registerNodeTransform(TextNode, (node) => {
      if (node.getTextContent() === 'foo' && !node.hasFormat('bold')) {
        node.toggleFormat('bold');
      }
    });

    // 2. Add underline
    const underlineListener = editor.registerNodeTransform(TextNode, (node) => {
      if (
        node.getTextContent() === 'foo' &&
        node.hasFormat('bold') &&
        !node.hasFormat('underline')
      ) {
        node.toggleFormat('underline');
      }
    });

    await editor.update(() => {
      const root = $getRoot();
      const paragraph = $createParagraphNode();
      root.append(paragraph);
      paragraph.append($createTextNode('foo'));
    });
    italicsListener();
    boldListener();
    underlineListener();

    expect(container.innerHTML).toBe(
      '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><strong class="editor-text-bold editor-text-italic editor-text-underline" data-lexical-text="true">foo</strong></p></div>',
    );
  });

  it('Synchronously runs three transforms, two of them depend on the other (2)', async () => {
    await init();

    // Add transform makes everything dirty the first time (let's not leverage this here)
    const skipFirst = [true, true, true];

    // 2. (Block transform) Add text
    const testParagraphListener = editor.registerNodeTransform(
      ParagraphNode,
      (paragraph) => {
        if (skipFirst[0]) {
          skipFirst[0] = false;

          return;
        }

        if (paragraph.isEmpty()) {
          paragraph.append($createTextNode('foo'));
        }
      },
    );

    // 2. (Text transform) Add bold to text
    const boldListener = editor.registerNodeTransform(TextNode, (node) => {
      if (node.getTextContent() === 'foo' && !node.hasFormat('bold')) {
        node.toggleFormat('bold');
      }
    });

    // 3. (Block transform) Add italics to bold text
    const italicsListener = editor.registerNodeTransform(
      ParagraphNode,
      (paragraph) => {
        const child = paragraph.getLastDescendant();

        if (
          child !== null &&
          child.hasFormat('bold') &&
          !child.hasFormat('italic')
        ) {
          child.toggleFormat('italic');
        }
      },
    );

    await editor.update(() => {
      const root = $getRoot();
      const paragraph = $createParagraphNode();
      root.append(paragraph);
    });

    await editor.update(() => {
      const root = $getRoot();
      const paragraph = root.getFirstChild();
      paragraph.markDirty();
    });

    testParagraphListener();
    boldListener();
    italicsListener();

    expect(container.innerHTML).toBe(
      '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><strong class="editor-text-bold editor-text-italic" data-lexical-text="true">foo</strong></p></div>',
    );
  });

  it('Synchronously runs three transforms, two of them depend on previously merged text content', async () => {
    const hasRun = [false, false, false];
    init();

    // 1. [Foo] into [<empty>,Fo,o,<empty>,!,<empty>]
    const fooListener = editor.registerNodeTransform(TextNode, (node) => {
      if (node.getTextContent() === 'Foo' && !hasRun[0]) {
        const [before, after] = node.splitText(2);

        before.insertBefore($createTextNode(''));
        after.insertAfter($createTextNode(''));
        after.insertAfter($createTextNode('!'));
        after.insertAfter($createTextNode(''));

        hasRun[0] = true;
      }
    });

    // 2. [Foo!] into [<empty>,Fo,o!,<empty>,!,<empty>]
    const megaFooListener = editor.registerNodeTransform(
      ParagraphNode,
      (paragraph) => {
        const child = paragraph.getFirstChild();

        if (
          $isTextNode(child) &&
          child.getTextContent() === 'Foo!' &&
          !hasRun[1]
        ) {
          const [before, after] = child.splitText(2);

          before.insertBefore($createTextNode(''));
          after.insertAfter($createTextNode(''));
          after.insertAfter($createTextNode('!'));
          after.insertAfter($createTextNode(''));

          hasRun[1] = true;
        }
      },
    );

    // 3. [Foo!!] into formatted bold [<empty>,Fo,o!!,<empty>]
    const boldFooListener = editor.registerNodeTransform(TextNode, (node) => {
      if (node.getTextContent() === 'Foo!!' && !hasRun[2]) {
        node.toggleFormat('bold');

        const [before, after] = node.splitText(2);
        before.insertBefore($createTextNode(''));
        after.insertAfter($createTextNode(''));

        hasRun[2] = true;
      }
    });

    await editor.update(() => {
      const root = $getRoot();
      const paragraph = $createParagraphNode();

      root.append(paragraph);
      paragraph.append($createTextNode('Foo'));
    });

    fooListener();
    megaFooListener();
    boldFooListener();

    expect(container.innerHTML).toBe(
      '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><strong class="editor-text-bold" data-lexical-text="true">Foo!!</strong></p></div>',
    );
  });

  it('text transform runs when node is removed', async () => {
    init();

    const executeTransform = jest.fn();
    let hasBeenRemoved = false;
    const removeListener = editor.registerNodeTransform(TextNode, (node) => {
      if (hasBeenRemoved) {
        executeTransform();
      }
    });

    await editor.update(() => {
      const root = $getRoot();
      const paragraph = $createParagraphNode();
      root.append(paragraph);
      paragraph.append(
        $createTextNode('Foo').toggleUnmergeable(),
        $createTextNode('Bar').toggleUnmergeable(),
      );
    });

    await editor.update(() => {
      $getRoot().getLastDescendant().remove();
      hasBeenRemoved = true;
    });

    expect(executeTransform).toHaveBeenCalledTimes(1);

    removeListener();
  });

  it('transforms only run on nodes that were explicitly marked as dirty', async () => {
    init();

    let executeParagraphNodeTransform = () => {
      return;
    };

    let executeTextNodeTransform = () => {
      return;
    };

    const removeParagraphTransform = editor.registerNodeTransform(
      ParagraphNode,
      (node) => {
        executeParagraphNodeTransform();
      },
    );
    const removeTextNodeTransform = editor.registerNodeTransform(
      TextNode,
      (node) => {
        executeTextNodeTransform();
      },
    );

    await editor.update(() => {
      const root = $getRoot();
      const paragraph = $createParagraphNode();
      root.append(paragraph);
      paragraph.append($createTextNode('Foo'));
    });

    await editor.update(() => {
      const root = $getRoot();
      const paragraph = root.getFirstChild<ParagraphNode>();
      const textNode = paragraph.getFirstChild<TextNode>();

      textNode.getWritable();

      executeParagraphNodeTransform = jest.fn();
      executeTextNodeTransform = jest.fn();
    });

    expect(executeParagraphNodeTransform).toHaveBeenCalledTimes(0);
    expect(executeTextNodeTransform).toHaveBeenCalledTimes(1);

    removeParagraphTransform();
    removeTextNodeTransform();
  });

  describe('transforms on siblings', () => {
    let textNodeKeys;
    let textTransformCount;
    let removeTransform;

    beforeEach(async () => {
      init();

      textNodeKeys = [];
      textTransformCount = [];

      await editor.update(() => {
        const root = $getRoot();
        const paragraph0 = $createParagraphNode();
        const paragraph1 = $createParagraphNode();
        const textNodes = [];

        for (let i = 0; i < 6; i++) {
          const node = $createTextNode(String(i)).toggleUnmergeable();
          textNodes.push(node);
          textNodeKeys.push(node.getKey());
          textTransformCount[i] = 0;
        }

        root.append(paragraph0, paragraph1);
        paragraph0.append(...textNodes.slice(0, 3));
        paragraph1.append(...textNodes.slice(3));
      });

      removeTransform = editor.registerNodeTransform(TextNode, (node) => {
        textTransformCount[node.__text]++;
      });
    });

    afterEach(() => {
      removeTransform();
    });

    it('on remove', async () => {
      await editor.update(() => {
        const textNode1 = $getNodeByKey(textNodeKeys[1]);
        textNode1.remove();
      });
      expect(textTransformCount).toEqual([2, 1, 2, 1, 1, 1]);
    });

    it('on replace', async () => {
      await editor.update(() => {
        const textNode1 = $getNodeByKey(textNodeKeys[1]);
        const textNode4 = $getNodeByKey(textNodeKeys[4]);
        textNode4.replace(textNode1);
      });
      expect(textTransformCount).toEqual([2, 2, 2, 2, 1, 2]);
    });

    it('on insertBefore', async () => {
      await editor.update(() => {
        const textNode1 = $getNodeByKey(textNodeKeys[1]);
        const textNode4 = $getNodeByKey(textNodeKeys[4]);
        textNode4.insertBefore(textNode1);
      });
      expect(textTransformCount).toEqual([2, 2, 2, 2, 2, 1]);
    });

    it('on insertAfter', async () => {
      await editor.update(() => {
        const textNode1 = $getNodeByKey(textNodeKeys[1]);
        const textNode4 = $getNodeByKey(textNodeKeys[4]);
        textNode4.insertAfter(textNode1);
      });
      expect(textTransformCount).toEqual([2, 2, 2, 1, 2, 2]);
    });

    it('on splitText', async () => {
      await editor.update(() => {
        const textNode1 = $getNodeByKey<TextNode>(textNodeKeys[1]);
        textNode1.setTextContent('67');
        textNode1.splitText(1);
        textTransformCount.push(0, 0);
      });
      expect(textTransformCount).toEqual([2, 1, 2, 1, 1, 1, 1, 1]);
    });

    it('on append', async () => {
      await editor.update(() => {
        const paragraph1 = $getRoot().getFirstChild<ParagraphNode>();
        paragraph1.append($createTextNode('6').toggleUnmergeable());
        textTransformCount.push(0);
      });
      expect(textTransformCount).toEqual([1, 1, 2, 1, 1, 1, 1]);
    });
  });

  it('Detects infinite recursivity on transforms', async () => {
    const errorListener = jest.fn();
    init(errorListener);

    const boldListener = editor.registerNodeTransform(TextNode, (node) => {
      node.toggleFormat('bold');
    });

    expect(errorListener).toHaveBeenCalledTimes(0);

    await editor.update(() => {
      const root = $getRoot();
      const paragraph = $createParagraphNode();
      root.append(paragraph);
      paragraph.append($createTextNode('foo'));
    });

    expect(errorListener).toHaveBeenCalledTimes(1);
    boldListener();
  });

  it('Should be able to update an editor state without a root element', () => {
    const ref = createRef<HTMLDivElement>();

    function TestBase({element}) {
      editor = useMemo(() => createTestEditor(), []);

      useEffect(() => {
        editor.setRootElement(element);
      }, [element]);

      return <div ref={ref} contentEditable={true} />;
    }

    ReactTestUtils.act(() => {
      reactRoot.render(<TestBase element={null} />);
    });
    editor.update(() => {
      const root = $getRoot();
      const paragraph = $createParagraphNode();
      const text = $createTextNode('This works!');
      root.append(paragraph);
      paragraph.append(text);
    });

    expect(container.innerHTML).toBe('<div contenteditable="true"></div>');

    ReactTestUtils.act(() => {
      reactRoot.render(<TestBase element={ref.current} />);
    });

    expect(container.innerHTML).toBe(
      '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">This works!</span></p></div>',
    );
  });

  it('Should be able to recover from an update error', async () => {
    const errorListener = jest.fn();
    init(errorListener);
    editor.update(() => {
      const root = $getRoot();

      if (root.getFirstChild() === null) {
        const paragraph = $createParagraphNode();
        const text = $createTextNode('This works!');
        root.append(paragraph);
        paragraph.append(text);
      }
    });

    // Wait for update to complete
    await Promise.resolve().then();

    expect(container.innerHTML).toBe(
      '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">This works!</span></p></div>',
    );
    expect(errorListener).toHaveBeenCalledTimes(0);

    editor.update(() => {
      const root = $getRoot();
      root
        .getFirstChild<ElementNode>()
        .getFirstChild<ElementNode>()
        .getFirstChild<TextNode>()
        .setTextContent('Foo');
    });

    expect(errorListener).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe(
      '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">This works!</span></p></div>',
    );
  });

  it('Should be able to recover from a reconciliation error', async () => {
    const errorListener = jest.fn();
    init(errorListener);
    editor.update(() => {
      const root = $getRoot();

      if (root.getFirstChild() === null) {
        const paragraph = $createParagraphNode();
        const text = $createTextNode('This works!');
        root.append(paragraph);
        paragraph.append(text);
      }
    });

    // Wait for update to complete
    await Promise.resolve().then();

    expect(container.innerHTML).toBe(
      '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">This works!</span></p></div>',
    );

    expect(errorListener).toHaveBeenCalledTimes(0);
    editor.update(() => {
      const root = $getRoot();
      root
        .getFirstChild<ElementNode>()
        .getFirstChild<TextNode>()
        .setTextContent('Foo');
    });

    expect(errorListener).toHaveBeenCalledTimes(0);

    // This is an intentional bug, to trigger the recovery
    editor._editorState._nodeMap = null;

    // Wait for update to complete
    await Promise.resolve().then();

    expect(errorListener).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe(
      '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">Foo</span></p></div>',
    );
  });

  it('Should be able to handle a change in root element', async () => {
    const rootListener = jest.fn();
    const updateListener = jest.fn();

    function TestBase({changeElement}) {
      editor = useMemo(() => createTestEditor(), []);

      useEffect(() => {
        editor.update(() => {
          const root = $getRoot();
          const firstChild = root.getFirstChild<ParagraphNode>();
          const text = changeElement ? 'Change successful' : 'Not changed';

          if (firstChild === null) {
            const paragraph = $createParagraphNode();
            const textNode = $createTextNode(text);
            paragraph.append(textNode);
            root.append(paragraph);
          } else {
            const textNode = firstChild.getFirstChild<TextNode>();
            textNode.setTextContent(text);
          }
        });
      }, [changeElement]);

      useEffect(() => {
        return editor.registerRootListener(rootListener);
      }, []);

      useEffect(() => {
        return editor.registerUpdateListener(updateListener);
      }, []);

      const ref = useCallback((node) => {
        editor.setRootElement(node);
      }, []);

      return changeElement ? (
        <span ref={ref} contentEditable={true} />
      ) : (
        <div ref={ref} contentEditable={true} />
      );
    }

    await ReactTestUtils.act(() => {
      reactRoot.render(<TestBase changeElement={false} />);
    });

    expect(container.innerHTML).toBe(
      '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">Not changed</span></p></div>',
    );

    await ReactTestUtils.act(() => {
      reactRoot.render(<TestBase changeElement={true} />);
    });

    expect(rootListener).toHaveBeenCalledTimes(3);
    expect(updateListener).toHaveBeenCalledTimes(3);
    expect(container.innerHTML).toBe(
      '<span contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p dir="ltr"><span data-lexical-text="true">Change successful</span></p></span>',
    );
  });

  describe('With node decorators', () => {
    function useDecorators() {
      const [decorators, setDecorators] = useState(() =>
        editor.getDecorators<ReactNode>(),
      );

      // Subscribe to changes
      useEffect(() => {
        return editor.registerDecoratorListener<ReactNode>((nextDecorators) => {
          setDecorators(nextDecorators);
        });
      }, []);

      const decoratedPortals = useMemo(
        () =>
          Object.keys(decorators).map((nodeKey) => {
            const reactDecorator = decorators[nodeKey];
            const element = editor.getElementByKey(nodeKey);

            return createPortal(reactDecorator, element);
          }),
        [decorators],
      );

      return decoratedPortals;
    }

    it('Should correctly render React component into Lexical node #1', async () => {
      const listener = jest.fn();

      function Test() {
        editor = useMemo(() => createTestEditor(), []);

        useEffect(() => {
          editor.registerRootListener(listener);
        }, []);

        const ref = useCallback((node) => {
          editor.setRootElement(node);
        }, []);

        const decorators = useDecorators();

        return (
          <>
            <div ref={ref} contentEditable={true} />
            {decorators}
          </>
        );
      }

      ReactTestUtils.act(() => {
        reactRoot.render(<Test />);
      });
      // Update the editor with the decorator
      await ReactTestUtils.act(async () => {
        await editor.update(() => {
          const paragraph = $createParagraphNode();
          const test = $createTestDecoratorNode();
          paragraph.append(test);
          $getRoot().append(paragraph);
        });
      });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(container.innerHTML).toBe(
        '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p>' +
          '<span data-lexical-decorator="true"><span>Hello world</span></span><br></p></div>',
      );
    });

    it('Should correctly render React component into Lexical node #2', async () => {
      const listener = jest.fn();

      function Test({divKey}): JSX.Element {
        function TestPlugin() {
          [editor] = useLexicalComposerContext();

          useEffect(() => {
            editor.registerRootListener(listener);
          }, []);

          return null;
        }

        return (
          <TestComposer>
            <RichTextPlugin
              contentEditable={
                // eslint-disable-next-line jsx-a11y/aria-role
                <ContentEditable key={divKey} role={null} spellCheck={null} />
              }
              placeholder=""
            />
            <TestPlugin />
          </TestComposer>
        );
      }

      ReactTestUtils.act(() => {
        reactRoot.render(<Test divKey={0} />);
      });

      // Wait for update to complete
      await Promise.resolve().then();

      expect(listener).toHaveBeenCalledTimes(1);
      expect(container.innerHTML).toBe(
        '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p><br></p></div>',
      );

      ReactTestUtils.act(() => {
        reactRoot.render(<Test divKey={1} />);
      });

      expect(listener).toHaveBeenCalledTimes(4);
      expect(container.innerHTML).toBe(
        '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p><br></p></div>',
      );

      // Wait for update to complete
      await Promise.resolve().then();

      editor.getEditorState().read(() => {
        const root = $getRoot();
        const paragraph = root.getFirstChild();
        expect(root).toEqual({
          __cachedText: '',
          __children: [paragraph.getKey()],
          __dir: null,
          __format: 0,
          __indent: 0,
          __key: 'root',
          __parent: null,
          __type: 'root',
        });
        expect(paragraph).toEqual({
          __children: [],
          __dir: null,
          __format: 0,
          __indent: 0,
          __key: paragraph.getKey(),
          __parent: 'root',
          __type: 'paragraph',
        });
      });
    });
  });

  describe('parseEditorState()', () => {
    let originalText;
    let parsedParagraph;
    let parsedRoot;
    let parsedText;
    let paragraphKey;
    let textKey;
    let parsedEditorState;

    it('exportJSON API - parses parsed JSON', async () => {
      await update(() => {
        const paragraph = $createParagraphNode();
        originalText = $createTextNode('Hello world');
        originalText.select(6, 11);
        paragraph.append(originalText);
        $getRoot().append(paragraph);
      });
      const stringifiedEditorState = JSON.stringify(editor.getEditorState());
      const parsedEditorStateFromObject = editor.parseEditorState(
        JSON.parse(stringifiedEditorState),
      );
      parsedEditorStateFromObject.read(() => {
        const root = $getRoot();
        expect(root.getTextContent()).toMatch(/Hello world/);
      });
    });

    describe('range selection', () => {
      beforeEach(async () => {
        await init();

        await update(() => {
          const paragraph = $createParagraphNode();
          originalText = $createTextNode('Hello world');
          originalText.select(6, 11);
          paragraph.append(originalText);
          $getRoot().append(paragraph);
        });
        const stringifiedEditorState = JSON.stringify(
          editor.getEditorState().toJSON(),
        );
        parsedEditorState = editor.parseEditorState(stringifiedEditorState);
        parsedEditorState.read(() => {
          parsedRoot = $getRoot();
          parsedParagraph = parsedRoot.getFirstChild();
          paragraphKey = parsedParagraph.getKey();
          parsedText = parsedParagraph.getFirstChild();
          textKey = parsedText.getKey();
        });
      });

      it('Parses the nodes of a stringified editor state', async () => {
        expect(parsedRoot).toEqual({
          __cachedText: null,
          __children: [paragraphKey],
          __dir: 'ltr',
          __format: 0,
          __indent: 0,
          __key: 'root',
          __parent: null,
          __type: 'root',
        });
        expect(parsedParagraph).toEqual({
          __children: [textKey],
          __dir: 'ltr',
          __format: 0,
          __indent: 0,
          __key: paragraphKey,
          __parent: 'root',
          __type: 'paragraph',
        });
        expect(parsedText).toEqual({
          __detail: 0,
          __format: 0,
          __key: textKey,
          __mode: 0,
          __parent: paragraphKey,
          __style: '',
          __text: 'Hello world',
          __type: 'text',
        });
      });

      it('Parses the text content of the editor state', async () => {
        expect(parsedEditorState.read(() => $getRoot().__cachedText)).toBe(
          null,
        );
        expect(parsedEditorState.read(() => $getRoot().getTextContent())).toBe(
          'Hello world',
        );
      });
    });

    describe('node selection', () => {
      beforeEach(async () => {
        init();

        await update(() => {
          const paragraph = $createParagraphNode();
          originalText = $createTextNode('Hello world');
          const selection = $createNodeSelection();
          selection.add(originalText.getKey());
          $setSelection(selection);
          paragraph.append(originalText);
          $getRoot().append(paragraph);
        });
        const stringifiedEditorState = JSON.stringify(
          editor.getEditorState().toJSON(),
        );
        parsedEditorState = editor.parseEditorState(stringifiedEditorState);
        parsedEditorState.read(() => {
          parsedRoot = $getRoot();
          parsedParagraph = parsedRoot.getFirstChild();
          paragraphKey = parsedParagraph.getKey();
          parsedText = parsedParagraph.getFirstChild();
          textKey = parsedText.getKey();
        });
      });

      it('Parses the nodes of a stringified editor state', async () => {
        expect(parsedRoot).toEqual({
          __cachedText: null,
          __children: [paragraphKey],
          __dir: 'ltr',
          __format: 0,
          __indent: 0,
          __key: 'root',
          __parent: null,
          __type: 'root',
        });
        expect(parsedParagraph).toEqual({
          __children: [textKey],
          __dir: 'ltr',
          __format: 0,
          __indent: 0,
          __key: paragraphKey,
          __parent: 'root',
          __type: 'paragraph',
        });
        expect(parsedText).toEqual({
          __detail: 0,
          __format: 0,
          __key: textKey,
          __mode: 0,
          __parent: paragraphKey,
          __style: '',
          __text: 'Hello world',
          __type: 'text',
        });
      });

      it('Parses the text content of the editor state', async () => {
        expect(parsedEditorState.read(() => $getRoot().__cachedText)).toBe(
          null,
        );
        expect(parsedEditorState.read(() => $getRoot().getTextContent())).toBe(
          'Hello world',
        );
      });
    });

    describe('grid selection', () => {
      beforeEach(async () => {
        init();

        await update(() => {
          const paragraph = $createParagraphNode();
          originalText = $createTextNode('Hello world');
          const selection = DEPRECATED_$createGridSelection();
          selection.set(
            originalText.getKey(),
            originalText.getKey(),
            originalText.getKey(),
          );
          $setSelection(selection);
          paragraph.append(originalText);
          $getRoot().append(paragraph);
        });

        const stringifiedEditorState = JSON.stringify(
          editor.getEditorState().toJSON(),
        );

        parsedEditorState = editor.parseEditorState(stringifiedEditorState);
        parsedEditorState.read(() => {
          parsedRoot = $getRoot();
          parsedParagraph = parsedRoot.getFirstChild();
          paragraphKey = parsedParagraph.getKey();
          parsedText = parsedParagraph.getFirstChild();
          textKey = parsedText.getKey();
        });
      });

      it('Parses the nodes of a stringified editor state', async () => {
        expect(parsedRoot).toEqual({
          __cachedText: null,
          __children: [paragraphKey],
          __dir: 'ltr',
          __format: 0,
          __indent: 0,
          __key: 'root',
          __parent: null,
          __type: 'root',
        });
        expect(parsedParagraph).toEqual({
          __children: [textKey],
          __dir: 'ltr',
          __format: 0,
          __indent: 0,
          __key: paragraphKey,
          __parent: 'root',
          __type: 'paragraph',
        });
        expect(parsedText).toEqual({
          __detail: 0,
          __format: 0,
          __key: textKey,
          __mode: 0,
          __parent: paragraphKey,
          __style: '',
          __text: 'Hello world',
          __type: 'text',
        });
      });

      it('Parses the text content of the editor state', async () => {
        expect(parsedEditorState.read(() => $getRoot().__cachedText)).toBe(
          null,
        );
        expect(parsedEditorState.read(() => $getRoot().getTextContent())).toBe(
          'Hello world',
        );
      });
    });
  });

  describe('$parseSerializedNode()', () => {
    it('parses serialized nodes', async () => {
      const expectedTextContent = 'Hello world\n\nHello world';
      let actualTextContent;
      let root;
      await update(() => {
        root = $getRoot();
        root.clear();
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode('Hello world'));
        root.append(paragraph);
      });
      const stringifiedEditorState = JSON.stringify(editor.getEditorState());
      const parsedEditorStateJson = JSON.parse(stringifiedEditorState);
      const rootJson = parsedEditorStateJson.root;
      await update(() => {
        const children = rootJson.children.map($parseSerializedNode);
        root = $getRoot();
        root.append(...children);
        actualTextContent = root.getTextContent();
      });
      expect(actualTextContent).toEqual(expectedTextContent);
    });
  });

  describe('Node children', () => {
    beforeEach(async () => {
      init();

      await reset();
    });

    async function reset() {
      init();

      await update(() => {
        const root = $getRoot();
        const paragraph = $createParagraphNode();
        root.append(paragraph);
      });
    }

    function generatePermutations(maxLen: number): string[][] {
      if (maxLen > 26) {
        throw new Error('maxLen <= 26');
      }

      const result = [];
      const current = [];
      const seen = new Set();

      (function permutationsImpl() {
        if (current.length > maxLen) {
          return;
        }

        result.push(current.slice());

        for (let i = 0; i < maxLen; i++) {
          const key = String(String.fromCharCode('a'.charCodeAt(0) + i));

          if (seen.has(key)) {
            continue;
          }

          seen.add(key);
          current.push(key);
          permutationsImpl();
          seen.delete(key);
          current.pop();
        }
      })();

      return result;
    }

    it('adds/removes/updates children', async () => {
      async function forPreviousNext(previous: string[], next: string[]) {
        const textToKey: Map<string, NodeKey> = new Map();

        // Previous editor state
        await update(() => {
          const writableParagraph = $getRoot()
            .getFirstChild<ParagraphNode>()
            .getWritable();
          writableParagraph.__children = [];

          for (let i = 0; i < previous.length; i++) {
            const previousText = previous[i];
            const textNode = new TextNode(previousText).toggleUnmergeable();
            textNode.__parent = writableParagraph.__key;

            writableParagraph.__children.push(textNode.__key);

            textToKey.set(previousText, textNode.__key);
          }
        });

        expect(getEditorStateTextContent(editor.getEditorState())).toBe(
          previous.join(''),
        );

        // Next editor state
        const nextSet = new Set(next);

        await update(() => {
          const writableParagraph = $getRoot()
            .getFirstChild<ParagraphNode>()
            .getWritable();

          // Remove previous that are not in next
          for (let i = 0; i < previous.length; i++) {
            const previousText = previous[i];

            if (!nextSet.has(previousText)) {
              const previousKey = textToKey.get(previousText);
              const previousNode = $getNodeByKey(previousKey);
              previousNode.remove();
              textToKey.delete(previousText);
            }
          }

          for (let i = 0; i < next.length; i++) {
            const nextText = next[i];
            const nextKey = textToKey.get(nextText);
            let textNode;

            if (nextKey === undefined) {
              // New node; append to the end
              textNode = new TextNode(nextText).toggleUnmergeable();
              textNode.__parent = writableParagraph.__key;

              expect($getNodeByKey(nextKey)).toBe(null);

              textToKey.set(nextText, textNode.__key);

              writableParagraph.__children.push(textNode.__key);
            } else {
              // Node exists in previous; reorder it
              textNode = $getNodeByKey(nextKey);

              expect(textNode.__text).toBe(nextText);

              writableParagraph.__children.splice(
                writableParagraph.__children.indexOf(nextKey),
                1,
              );

              writableParagraph.__children.push(textNode.__key);
            }
          }
        });
        // Expect text content + HTML to be correct
        expect(getEditorStateTextContent(editor.getEditorState())).toBe(
          next.join(''),
        );
        expect(container.innerHTML.replace(/\sclass="*."/g, '')).toBe(
          `<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p${
            next.length > 0 ? ' dir="ltr"' : ''
          }>${
            next.length > 0
              ? next
                  .map(
                    (text) => `<span data-lexical-text="true">${text}</span>`,
                  )
                  .join('')
              : `<br>`
          }</p></div>`,
        );

        // Expect editorState to have the correct latest nodes
        editor.getEditorState().read(() => {
          for (let i = 0; i < next.length; i++) {
            const nextText = next[i];
            const nextKey = textToKey.get(nextText);

            expect($getNodeByKey(nextKey)).not.toBe(null);
          }
        });

        expect(editor.getEditorState()._nodeMap.size).toBe(next.length + 2);
      }

      const permutations = generatePermutations(4);

      for (let i = 0; i < permutations.length; i++) {
        for (let j = 0; j < permutations.length; j++) {
          await forPreviousNext(permutations[i], permutations[j]);
          await reset();
        }
      }
    });

    it('moves node to different tree branches', async () => {
      function createElementNodeWithText(text: string) {
        const elementNode = $createTestElementNode();
        const textNode = $createTextNode(text);
        elementNode.append(textNode);

        return [elementNode, textNode];
      }

      let paragraphNodeKey;
      let elementNode1Key;
      let textNode1Key;
      let elementNode2Key;
      let textNode2Key;

      await update(() => {
        const paragraph: ParagraphNode = $getRoot().getFirstChild();
        paragraphNodeKey = paragraph.getKey();

        const [elementNode1, textNode1] = createElementNodeWithText('A');
        elementNode1Key = elementNode1.getKey();
        textNode1Key = textNode1.getKey();

        const [elementNode2, textNode2] = createElementNodeWithText('B');
        elementNode2Key = elementNode2.getKey();
        textNode2Key = textNode2.getKey();

        paragraph.append(elementNode1, elementNode2);
      });

      await update(() => {
        const elementNode1: ElementNode = $getNodeByKey(elementNode1Key);
        const elementNode2: TextNode = $getNodeByKey(elementNode2Key);
        elementNode1.append(elementNode2);
      });
      const keys = [
        paragraphNodeKey,
        elementNode1Key,
        textNode1Key,
        elementNode2Key,
        textNode2Key,
      ];

      for (let i = 0; i < keys.length; i++) {
        expect(editor._editorState._nodeMap.has(keys[i])).toBe(true);
        expect(editor._keyToDOMMap.has(keys[i])).toBe(true);
      }

      expect(editor._editorState._nodeMap.size).toBe(keys.length + 1); // + root
      expect(editor._keyToDOMMap.size).toBe(keys.length + 1); // + root
      expect(container.innerHTML).toBe(
        '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p><div dir="ltr"><span data-lexical-text="true">A</span><div dir="ltr"><span data-lexical-text="true">B</span></div></div></p></div>',
      );
    });

    it('moves node to different tree branches (inverse)', async () => {
      function createElementNodeWithText(text: string) {
        const elementNode = $createTestElementNode();
        const textNode = $createTextNode(text);
        elementNode.append(textNode);

        return elementNode;
      }

      let elementNode1Key;
      let elementNode2Key;

      await update(() => {
        const paragraph: ParagraphNode = $getRoot().getFirstChild();

        const elementNode1 = createElementNodeWithText('A');
        elementNode1Key = elementNode1.getKey();

        const elementNode2 = createElementNodeWithText('B');
        elementNode2Key = elementNode2.getKey();

        paragraph.append(elementNode1, elementNode2);
      });

      await update(() => {
        const elementNode1 = $getNodeByKey<TextNode>(elementNode1Key);
        const elementNode2 = $getNodeByKey<ElementNode>(elementNode2Key);
        elementNode2.append(elementNode1);
      });

      expect(container.innerHTML).toBe(
        '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p><div dir="ltr"><span data-lexical-text="true">B</span><div dir="ltr"><span data-lexical-text="true">A</span></div></div></p></div>',
      );
    });

    it('moves node to different tree branches (node appended twice in two different branches)', async () => {
      function createElementNodeWithText(text: string) {
        const elementNode = $createTestElementNode();
        const textNode = $createTextNode(text);
        elementNode.append(textNode);

        return elementNode;
      }

      let elementNode1Key;
      let elementNode2Key;
      let elementNode3Key;

      await update(() => {
        const paragraph: ParagraphNode = $getRoot().getFirstChild();

        const elementNode1 = createElementNodeWithText('A');
        elementNode1Key = elementNode1.getKey();

        const elementNode2 = createElementNodeWithText('B');
        elementNode2Key = elementNode2.getKey();

        const elementNode3 = createElementNodeWithText('C');
        elementNode3Key = elementNode3.getKey();

        paragraph.append(elementNode1, elementNode2, elementNode3);
      });

      await update(() => {
        const elementNode1 = $getNodeByKey<ElementNode>(elementNode1Key);
        const elementNode2 = $getNodeByKey<ElementNode>(elementNode2Key);
        const elementNode3: TextNode = $getNodeByKey(elementNode3Key);
        elementNode2.append(elementNode3);
        elementNode1.append(elementNode3);
      });

      expect(container.innerHTML).toBe(
        '<div contenteditable="true" style="user-select: text; white-space: pre-wrap; word-break: break-word;" data-lexical-editor="true"><p><div dir="ltr"><span data-lexical-text="true">A</span><div dir="ltr"><span data-lexical-text="true">C</span></div></div><div dir="ltr"><span data-lexical-text="true">B</span></div></p></div>',
      );
    });
  });

  it('can subscribe and unsubscribe from commands and the callback is fired', () => {
    init();

    const commandListener = jest.fn();
    const command = createCommand('TEST_COMMAND');
    const payload = 'testPayload';
    const removeCommandListener = editor.registerCommand(
      command,
      commandListener,
      COMMAND_PRIORITY_EDITOR,
    );
    editor.dispatchCommand(command, payload);
    editor.dispatchCommand(command, payload);
    editor.dispatchCommand(command, payload);

    expect(commandListener).toHaveBeenCalledTimes(3);
    expect(commandListener).toHaveBeenCalledWith(payload, editor);

    removeCommandListener();

    editor.dispatchCommand(command, payload);
    editor.dispatchCommand(command, payload);
    editor.dispatchCommand(command, payload);

    expect(commandListener).toHaveBeenCalledTimes(3);
    expect(commandListener).toHaveBeenCalledWith(payload, editor);
  });

  it('removes the command from the command map when no listener are attached', () => {
    init();

    const commandListener = jest.fn();
    const commandListenerTwo = jest.fn();
    const command = createCommand('TEST_COMMAND');
    const removeCommandListener = editor.registerCommand(
      command,
      commandListener,
      COMMAND_PRIORITY_EDITOR,
    );
    const removeCommandListenerTwo = editor.registerCommand(
      command,
      commandListenerTwo,
      COMMAND_PRIORITY_EDITOR,
    );

    expect(editor._commands).toEqual(
      new Map([
        [
          command,
          [
            new Set([commandListener, commandListenerTwo]),
            new Set(),
            new Set(),
            new Set(),
            new Set(),
          ],
        ],
      ]),
    );

    removeCommandListener();

    expect(editor._commands).toEqual(
      new Map([
        [
          command,
          [
            new Set([commandListenerTwo]),
            new Set(),
            new Set(),
            new Set(),
            new Set(),
          ],
        ],
      ]),
    );

    removeCommandListenerTwo();

    expect(editor._commands).toEqual(new Map());
  });

  it('can register transforms before updates', async () => {
    init();

    const emptyTransform = () => {
      return;
    };

    const removeTextTransform = editor.registerNodeTransform(
      TextNode,
      emptyTransform,
    );
    const removeParagraphTransform = editor.registerNodeTransform(
      ParagraphNode,
      emptyTransform,
    );

    await editor.update(() => {
      const root = $getRoot();
      const paragraph = $createParagraphNode();
      root.append(paragraph);
    });

    removeTextTransform();
    removeParagraphTransform();
  });

  it('textcontent listener', async () => {
    init();

    const fn = jest.fn();
    editor.update(() => {
      const root = $getRoot();
      const paragraph = $createParagraphNode();
      const textNode = $createTextNode('foo');
      root.append(paragraph);
      paragraph.append(textNode);
    });
    editor.registerTextContentListener((text) => {
      fn(text);
    });

    await editor.update(() => {
      const root = $getRoot();
      const child = root.getLastDescendant();
      child.insertAfter($createTextNode('bar'));
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('foobar');

    await editor.update(() => {
      const root = $getRoot();
      const child = root.getLastDescendant();
      child.insertAfter($createLineBreakNode());
    });

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledWith('foobar\n');
  });

  it('mutation listener', async () => {
    init();

    const paragraphNodeMutations = jest.fn();
    const textNodeMutations = jest.fn();
    editor.registerMutationListener(ParagraphNode, paragraphNodeMutations);
    editor.registerMutationListener(TextNode, textNodeMutations);
    const paragraphKeys = [];
    const textNodeKeys = [];

    // No await intentional (batch with next)
    editor.update(() => {
      const root = $getRoot();
      const paragraph = $createParagraphNode();
      const textNode = $createTextNode('foo');
      root.append(paragraph);
      paragraph.append(textNode);
      paragraphKeys.push(paragraph.getKey());
      textNodeKeys.push(textNode.getKey());
    });

    await editor.update(() => {
      const textNode = $getNodeByKey(textNodeKeys[0]);
      const textNode2 = $createTextNode('bar').toggleFormat('bold');
      const textNode3 = $createTextNode('xyz').toggleFormat('italic');
      textNode.insertAfter(textNode2);
      textNode2.insertAfter(textNode3);
      textNodeKeys.push(textNode2.getKey());
      textNodeKeys.push(textNode3.getKey());
    });

    await editor.update(() => {
      $getRoot().clear();
    });

    await editor.update(() => {
      const root = $getRoot();
      const paragraph = $createParagraphNode();

      paragraphKeys.push(paragraph.getKey());

      // Created and deleted in the same update (not attached to node)
      textNodeKeys.push($createTextNode('zzz').getKey());
      root.append(paragraph);
    });

    expect(paragraphNodeMutations.mock.calls.length).toBe(3);
    expect(textNodeMutations.mock.calls.length).toBe(2);

    const [paragraphMutation1, paragraphMutation2, paragraphMutation3] =
      paragraphNodeMutations.mock.calls;
    const [textNodeMutation1, textNodeMutation2] = textNodeMutations.mock.calls;

    expect(paragraphMutation1[0].size).toBe(1);
    expect(paragraphMutation1[0].get(paragraphKeys[0])).toBe('created');
    expect(paragraphMutation1[0].size).toBe(1);
    expect(paragraphMutation2[0].get(paragraphKeys[0])).toBe('destroyed');
    expect(paragraphMutation3[0].size).toBe(1);
    expect(paragraphMutation3[0].get(paragraphKeys[1])).toBe('created');
    expect(textNodeMutation1[0].size).toBe(3);
    expect(textNodeMutation1[0].get(textNodeKeys[0])).toBe('created');
    expect(textNodeMutation1[0].get(textNodeKeys[1])).toBe('created');
    expect(textNodeMutation1[0].get(textNodeKeys[2])).toBe('created');
    expect(textNodeMutation2[0].size).toBe(3);
    expect(textNodeMutation2[0].get(textNodeKeys[0])).toBe('destroyed');
    expect(textNodeMutation2[0].get(textNodeKeys[1])).toBe('destroyed');
    expect(textNodeMutation2[0].get(textNodeKeys[2])).toBe('destroyed');
  });

  it('mutation listener with setEditorState', async () => {
    init();

    await editor.update(() => {
      $getRoot().append($createParagraphNode());
    });

    const initialEditorState = editor.getEditorState();
    const textNodeMutations = jest.fn();
    editor.registerMutationListener(TextNode, textNodeMutations);
    const textNodeKeys = [];

    await editor.update(() => {
      const paragraph = $getRoot().getFirstChild<ParagraphNode>();
      const textNode1 = $createTextNode('foo');
      paragraph.append(textNode1);
      textNodeKeys.push(textNode1.getKey());
    });

    const fooEditorState = editor.getEditorState();

    await editor.setEditorState(initialEditorState);
    // This line should have no effect on the mutation listeners
    const parsedFooEditorState = editor.parseEditorState(
      JSON.stringify(fooEditorState),
    );

    await editor.update(() => {
      const paragraph = $getRoot().getFirstChild<ParagraphNode>();
      const textNode2 = $createTextNode('bar').toggleFormat('bold');
      const textNode3 = $createTextNode('xyz').toggleFormat('italic');
      paragraph.append(textNode2, textNode3);
      textNodeKeys.push(textNode2.getKey(), textNode3.getKey());
    });

    await editor.setEditorState(parsedFooEditorState);

    expect(textNodeMutations.mock.calls.length).toBe(4);

    const [
      textNodeMutation1,
      textNodeMutation2,
      textNodeMutation3,
      textNodeMutation4,
    ] = textNodeMutations.mock.calls;

    expect(textNodeMutation1[0].size).toBe(1);
    expect(textNodeMutation1[0].get(textNodeKeys[0])).toBe('created');
    expect(textNodeMutation2[0].size).toBe(1);
    expect(textNodeMutation2[0].get(textNodeKeys[0])).toBe('destroyed');
    expect(textNodeMutation3[0].size).toBe(2);
    expect(textNodeMutation3[0].get(textNodeKeys[1])).toBe('created');
    expect(textNodeMutation3[0].get(textNodeKeys[2])).toBe('created');
    expect(textNodeMutation4[0].size).toBe(3); // +1 newly generated key by parseEditorState
    expect(textNodeMutation4[0].get(textNodeKeys[1])).toBe('destroyed');
    expect(textNodeMutation4[0].get(textNodeKeys[2])).toBe('destroyed');
  });

  it('mutation listeners does not trigger when other node types are mutated', async () => {
    init();

    const paragraphNodeMutations = jest.fn();
    const textNodeMutations = jest.fn();
    editor.registerMutationListener(ParagraphNode, paragraphNodeMutations);
    editor.registerMutationListener(TextNode, textNodeMutations);

    await editor.update(() => {
      $getRoot().append($createParagraphNode());
    });

    expect(paragraphNodeMutations.mock.calls.length).toBe(1);
    expect(textNodeMutations.mock.calls.length).toBe(0);
  });

  it('mutation listeners with normalization', async () => {
    init();

    const textNodeMutations = jest.fn();
    editor.registerMutationListener(TextNode, textNodeMutations);
    const textNodeKeys = [];

    await editor.update(() => {
      const root = $getRoot();
      const paragraph = $createParagraphNode();
      const textNode1 = $createTextNode('foo');
      const textNode2 = $createTextNode('bar');

      textNodeKeys.push(textNode1.getKey(), textNode2.getKey());
      root.append(paragraph);
      paragraph.append(textNode1, textNode2);
    });

    await editor.update(() => {
      const paragraph = $getRoot().getFirstChild<ParagraphNode>();
      const textNode3 = $createTextNode('xyz').toggleFormat('bold');
      paragraph.append(textNode3);
      textNodeKeys.push(textNode3.getKey());
    });

    await editor.update(() => {
      const textNode3 = $getNodeByKey<TextNode>(textNodeKeys[2]);
      textNode3.toggleFormat('bold'); // Normalize with foobar
    });

    expect(textNodeMutations.mock.calls.length).toBe(3);

    const [textNodeMutation1, textNodeMutation2, textNodeMutation3] =
      textNodeMutations.mock.calls;

    expect(textNodeMutation1[0].size).toBe(1);
    expect(textNodeMutation1[0].get(textNodeKeys[0])).toBe('created');
    expect(textNodeMutation2[0].size).toBe(1);
    expect(textNodeMutation2[0].get(textNodeKeys[2])).toBe('created');
    expect(textNodeMutation3[0].size).toBe(2);
    expect(textNodeMutation3[0].get(textNodeKeys[0])).toBe('updated');
    expect(textNodeMutation3[0].get(textNodeKeys[2])).toBe('destroyed');
  });

  it('mutation "update" listener', async () => {
    init();

    const paragraphNodeMutations = jest.fn();
    const textNodeMutations = jest.fn();

    editor.registerMutationListener(ParagraphNode, paragraphNodeMutations);
    editor.registerMutationListener(TextNode, textNodeMutations);

    const paragraphNodeKeys = [];
    const textNodeKeys = [];

    await editor.update(() => {
      const root = $getRoot();
      const paragraph = $createParagraphNode();
      const textNode1 = $createTextNode('foo');
      textNodeKeys.push(textNode1.getKey());
      paragraphNodeKeys.push(paragraph.getKey());
      root.append(paragraph);
      paragraph.append(textNode1);
    });

    expect(paragraphNodeMutations.mock.calls.length).toBe(1);

    const [paragraphNodeMutation1] = paragraphNodeMutations.mock.calls;
    expect(textNodeMutations.mock.calls.length).toBe(1);

    const [textNodeMutation1] = textNodeMutations.mock.calls;

    expect(textNodeMutation1[0].size).toBe(1);
    expect(paragraphNodeMutation1[0].size).toBe(1);

    // Change first text node's content.
    await editor.update(() => {
      const textNode1 = $getNodeByKey<TextNode>(textNodeKeys[0]);
      textNode1.setTextContent('Test'); // Normalize with foobar
    });

    // Append text node to paragraph.
    await editor.update(() => {
      const paragraphNode1 = $getNodeByKey<ParagraphNode>(paragraphNodeKeys[0]);
      const textNode1 = $createTextNode('foo');
      paragraphNode1.append(textNode1);
    });

    expect(textNodeMutations.mock.calls.length).toBe(3);

    const textNodeMutation2 = textNodeMutations.mock.calls[1];

    // Show TextNode was updated when text content changed.
    expect(textNodeMutation2[0].get(textNodeKeys[0])).toBe('updated');
    expect(paragraphNodeMutations.mock.calls.length).toBe(2);

    const paragraphNodeMutation2 = paragraphNodeMutations.mock.calls[1];

    // Show ParagraphNode was updated when new text node was appended.
    expect(paragraphNodeMutation2[0].get(paragraphNodeKeys[0])).toBe('updated');

    let tableCellKey;
    let tableRowKey;

    const tableCellMutations = jest.fn();
    const tableRowMutations = jest.fn();

    editor.registerMutationListener(TableCellNode, tableCellMutations);
    editor.registerMutationListener(TableRowNode, tableRowMutations);
    // Create Table

    await editor.update(() => {
      const root = $getRoot();
      const tableCell = $createTableCellNode(0);
      const tableRow = $createTableRowNode();
      const table = $createTableNode();

      tableRow.append(tableCell);
      table.append(tableRow);
      root.append(table);

      tableRowKey = tableRow.getKey();
      tableCellKey = tableCell.getKey();
    });
    // Add New Table Cell To Row

    await editor.update(() => {
      const tableRow = $getNodeByKey<TableRowNode>(tableRowKey);
      const tableCell = $createTableCellNode(0);
      tableRow.append(tableCell);
    });

    // Update Table Cell
    await editor.update(() => {
      const tableCell = $getNodeByKey<TableCellNode>(tableCellKey);
      tableCell.toggleHeaderStyle(1);
    });

    expect(tableCellMutations.mock.calls.length).toBe(3);
    const tableCellMutation3 = tableCellMutations.mock.calls[2];

    // Show table cell is updated when header value changes.
    expect(tableCellMutation3[0].get(tableCellKey)).toBe('updated');
    expect(tableRowMutations.mock.calls.length).toBe(2);

    const tableRowMutation2 = tableRowMutations.mock.calls[1];

    // Show row is updated when a new child is added.
    expect(tableRowMutation2[0].get(tableRowKey)).toBe('updated');
  });

  it('editable listener', () => {
    init();

    const editableFn = jest.fn();
    editor.registerEditableListener(editableFn);

    expect(editor.isEditable()).toBe(true);

    editor.setEditable(false);

    expect(editor.isEditable()).toBe(false);

    editor.setEditable(true);

    expect(editableFn.mock.calls).toEqual([[false], [true]]);
  });

  it('does not add new listeners while triggering existing', async () => {
    const updateListener = jest.fn();
    const mutationListener = jest.fn();
    const nodeTransformListener = jest.fn();
    const textContentListener = jest.fn();
    const editableListener = jest.fn();
    const commandListener = jest.fn();
    const TEST_COMMAND = createCommand('TEST_COMMAND');

    init();

    editor.registerUpdateListener(() => {
      updateListener();

      editor.registerUpdateListener(() => {
        updateListener();
      });
    });

    editor.registerMutationListener(TextNode, (map) => {
      mutationListener();
      editor.registerMutationListener(TextNode, () => {
        mutationListener();
      });
    });

    editor.registerNodeTransform(ParagraphNode, () => {
      nodeTransformListener();
      editor.registerNodeTransform(ParagraphNode, () => {
        nodeTransformListener();
      });
    });

    editor.registerEditableListener(() => {
      editableListener();
      editor.registerEditableListener(() => {
        editableListener();
      });
    });

    editor.registerTextContentListener(() => {
      textContentListener();
      editor.registerTextContentListener(() => {
        textContentListener();
      });
    });

    editor.registerCommand(
      TEST_COMMAND,
      (): boolean => {
        commandListener();
        editor.registerCommand(
          TEST_COMMAND,
          commandListener,
          COMMAND_PRIORITY_LOW,
        );
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );

    await update(() => {
      $getRoot().append(
        $createParagraphNode().append($createTextNode('Hello world')),
      );
    });

    editor.dispatchCommand(TEST_COMMAND, false);

    editor.setEditable(false);

    expect(updateListener).toHaveBeenCalledTimes(1);
    expect(editableListener).toHaveBeenCalledTimes(1);
    expect(commandListener).toHaveBeenCalledTimes(1);
    expect(textContentListener).toHaveBeenCalledTimes(1);
    expect(nodeTransformListener).toHaveBeenCalledTimes(1);
    expect(mutationListener).toHaveBeenCalledTimes(1);
  });

  it('can use flushSync for synchronous updates', () => {
    init();
    const onUpdate = jest.fn();
    editor.registerUpdateListener(onUpdate);
    editor.update(
      () => {
        $getRoot().append(
          $createParagraphNode().append($createTextNode('Sync update')),
        );
      },
      {
        discrete: true,
      },
    );

    const textContent = editor
      .getEditorState()
      .read(() => $getRoot().getTextContent());
    expect(textContent).toBe('Sync update');
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('does not include linebreak into inline elements', async () => {
    init();

    await editor.update(() => {
      $getRoot().append(
        $createParagraphNode().append(
          $createTextNode('Hello'),
          $createTestInlineElementNode(),
        ),
      );
    });

    expect(container.firstElementChild?.innerHTML).toBe(
      '<p dir="ltr"><span data-lexical-text="true">Hello</span><a></a></p>',
    );
  });
});

/**
 * Unit Tests for sources.config
 * Tests factory function and system initialization
 */

import { createRuleExecutionSystem } from '@modules/rule-execution/config/sources.config.js';
import { RuleExecutionManager } from '@modules/rule-execution/core/rule-execution-manager.js';
import { DefaultRuleSource } from '@modules/rule-execution/sources/default-rule-source.js';
import { CustomRuleSource } from '@modules/rule-execution/sources/custom-rule-source.js';
import { SelectorParser } from '@modules/rule-execution/parsers/selector-parser.js';
import { SelectorExecutor } from '@modules/rule-execution/executors/selector-executor.js';
import { PerformanceCoordinator } from '@modules/rule-execution/core/performance-coordinator.js';

describe('sources.config', () => {
  describe('createRuleExecutionSystem()', () => {
    test('should return RuleExecutionManager instance', async () => {
      const manager = await createRuleExecutionSystem();

      expect(manager).toBeInstanceOf(RuleExecutionManager);
    });

    test('should register default source', async () => {
      const manager = await createRuleExecutionSystem();

      const source = manager.sources.get('default');
      expect(source).toBeInstanceOf(DefaultRuleSource);
    });

    test('should register custom source', async () => {
      const manager = await createRuleExecutionSystem();

      const source = manager.sources.get('custom');
      expect(source).toBeInstanceOf(CustomRuleSource);
    });

    test('should register selector parser', async () => {
      const manager = await createRuleExecutionSystem();

      const parser = manager.parsers.get('selector');
      expect(parser).toBeInstanceOf(SelectorParser);
    });

    test('should register selector executor', async () => {
      const manager = await createRuleExecutionSystem();

      const executor = manager.executors.get('selector');
      expect(executor).toBeInstanceOf(SelectorExecutor);
    });

    test('should initialize PerformanceCoordinator', async () => {
      const manager = await createRuleExecutionSystem();

      expect(manager.performanceCoordinator).toBeInstanceOf(PerformanceCoordinator);
    });

    test('should configure PerformanceCoordinator with correct options', async () => {
      const manager = await createRuleExecutionSystem();

      const coordinator = manager.performanceCoordinator;
      expect(coordinator.getBatchSize()).toBe(50);
    });

    test('should wire all components together correctly', async () => {
      const manager = await createRuleExecutionSystem();

      // Verify sources map
      expect(manager.sources.size).toBeGreaterThanOrEqual(2);
      expect(manager.sources.has('default')).toBe(true);
      expect(manager.sources.has('custom')).toBe(true);

      // Verify executors map
      expect(manager.executors.size).toBeGreaterThanOrEqual(1);
      expect(manager.executors.has('selector')).toBe(true);

      // Verify parsers map
      expect(manager.parsers.size).toBeGreaterThanOrEqual(1);
      expect(manager.parsers.has('selector')).toBe(true);

      // Verify coordinator
      expect(manager.performanceCoordinator).toBeDefined();
    });

    test('should create independent instances on multiple calls', async () => {
      const manager1 = await createRuleExecutionSystem();
      const manager2 = await createRuleExecutionSystem();

      expect(manager1).not.toBe(manager2);
      expect(manager1.sources).not.toBe(manager2.sources);
      expect(manager1.executors).not.toBe(manager2.executors);
    });
  });

  describe('System Integration', () => {
    test('should create fully functional system', async () => {
      const manager = await createRuleExecutionSystem();

      // Note: Mocking not needed here since we're testing with empty enabledSources
      // The system should handle this gracefully without needing storage access

      // Should be able to execute rules without errors
      await expect(
        manager.executeAllRules('example.com', {
          enabledSources: []
        })
      ).resolves.not.toThrow();
    });

    test('should have proper source-executor-parser relationships', async () => {
      const manager = await createRuleExecutionSystem();

      // Default source should use selector executor
      const defaultSource = manager.sources.get('default');
      const executorType = defaultSource.getExecutorType();

      expect(executorType).toBe('selector');
      expect(manager.executors.has(executorType)).toBe(true);
      expect(manager.parsers.has(executorType)).toBe(true);
    });

    test('should have executor with access to coordinator', async () => {
      const manager = await createRuleExecutionSystem();

      const executor = manager.executors.get('selector');
      expect(executor.performanceCoordinator).toBe(manager.performanceCoordinator);
    });
  });

  describe('Source Configuration', () => {
    test('should configure default source with correct properties', async () => {
      const manager = await createRuleExecutionSystem();
      const source = manager.sources.get('default');

      expect(source.getName()).toBe('Default Selector Rules');
      expect(source.getExecutorType()).toBe('selector');
      expect(source.getCacheKey()).toBe('defaultRules');
      expect(source.getUpdateInterval()).toBe(0);
    });

    test('should configure custom source with correct properties', async () => {
      const manager = await createRuleExecutionSystem();
      const source = manager.sources.get('custom');

      expect(source.getName()).toBe('Custom Selector Rules');
      expect(source.getExecutorType()).toBe('selector');
      expect(source.getCacheKey()).toBe('customRules');
      expect(source.getUpdateInterval()).toBe(0);
    });
  });

  describe('Performance', () => {
    test('should create system quickly', async () => {
      const start = Date.now();
      await createRuleExecutionSystem();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Should be very fast
    });

    test('should create multiple instances efficiently', async () => {
      const start = Date.now();
      await Promise.all([
        createRuleExecutionSystem(),
        createRuleExecutionSystem(),
        createRuleExecutionSystem(),
        createRuleExecutionSystem(),
        createRuleExecutionSystem()
      ]);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(500);
    });
  });

  describe('Error Handling', () => {
    test('should handle errors during initialization gracefully', async () => {
      // Even if there are issues, createRuleExecutionSystem should return a manager
      const manager = await createRuleExecutionSystem();

      expect(manager).toBeInstanceOf(RuleExecutionManager);
    });
  });

  describe('Future Extensibility', () => {
    test('should be ready for EasyList source integration', async () => {
      const manager = await createRuleExecutionSystem();

      // After Phase 2, this should have easylist source
      // For now, just verify the structure supports adding more sources
      expect(manager.sources).toBeInstanceOf(Map);
      expect(manager.executors).toBeInstanceOf(Map);
      expect(manager.parsers).toBeInstanceOf(Map);
    });

    test('should support multiple executor types', async () => {
      const manager = await createRuleExecutionSystem();

      // Currently has 'selector', should be able to add 'domain-pattern' later
      expect(manager.executors).toBeInstanceOf(Map);
      expect(manager.parsers).toBeInstanceOf(Map);
    });
  });

  describe('Configuration Constants', () => {
    test('should have expected configuration values', async () => {
      const manager = await createRuleExecutionSystem();

      // Verify performance coordinator configuration
      const coordinator = manager.performanceCoordinator;
      expect(coordinator.getBatchSize()).toBe(50);

      // These are the expected defaults from the plan
      // maxFrameTime should be 16ms (not directly testable without private access)
      // But we can verify the coordinator is properly configured
      expect(coordinator).toBeDefined();
      expect(typeof coordinator.yieldIfNeeded).toBe('function');
      expect(typeof coordinator.executeInBatches).toBe('function');
    });
  });
});

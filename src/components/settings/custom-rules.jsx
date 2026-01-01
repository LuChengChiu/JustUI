import Button from "@/components/ui/button";
import SettingsCheckbox from "@/components/ui/checkbox/settings-checkbox";
import TagsInput from "@/components/ui/tags-input";
import { H3, Text } from "@/components/ui/typography";
import { useCallback, useState } from "react";
import RuleEditModal from "./rule-edit-modal";

const emptyRule = (
  <div className="text-center p-6  bg-gray-100 rounded-lg">
    <Text color="secondary">No custom rules defined</Text>
    <Text variant="caption" color="secondary" className="mt-1">
      Click "Add New Rule" to create your first custom rule
    </Text>
  </div>
);

export default function CustomRulesManager({
  enabled,
  onToggleEnable,
  customRules,
  onRemoveCustomRule,
  onAddNewRule,
  onEditRule,
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  // Handle rule tag clicks to edit existing rules
  const handleRuleTagClick = (ruleSelector) => {
    const rule = customRules.find((r) => r.selector === ruleSelector);
    if (rule) {
      setEditingRule(rule);
      setIsModalOpen(true);
    }
  };

  const handleClose = useCallback(() => {
    setIsModalOpen(false);
    setEditingRule(null);
  }, []);

  // Handle modal save (both add and edit)
  const handleModalSave = useCallback(
    (ruleData, isEditMode) => {
      if (isEditMode) {
        onEditRule(ruleData);
      } else {
        onAddNewRule(ruleData);
      }
      handleClose();
    },
    [onEditRule, onAddNewRule, handleClose]
  );

  // Handle opening modal for new rule
  const handleAddNewRule = () => {
    setEditingRule(null);
    setIsModalOpen(true);
  };

  // Handle tags change (rule removal via TagsInput)
  const handleTagsChange = useCallback(
    (newSelectors) => {
      // Find which rule was removed
      const removedRule = customRules.find(
        (rule) => !newSelectors.includes(rule.selector)
      );
      if (removedRule) {
        onRemoveCustomRule(removedRule.id);
      }
    },
    [customRules, onRemoveCustomRule]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <H3 color="primary">Custom Selector Rules</H3>
        <Button onClick={handleAddNewRule} variant="primary" size="sm">
          Add New Rule
        </Button>
      </div>

      {/* Existing Rules */}
      {customRules.length > 0 ? (
        <div className="space-y-2">
          <H3 color="primary">Existing Rules ({customRules.length})</H3>
          <Text variant="caption" color="secondary">
            Click on any rule to edit it
          </Text>
          <TagsInput.Root
            value={customRules.map((rule) => rule.selector)}
            onChange={handleTagsChange}
            onTagClick={handleRuleTagClick}
            maxLines={3}
            size="md"
            variant="outline"
            className="w-full"
          >
            <TagsInput.Control>
              <TagsInput.Items className="[&>span>span:first-child]:max-w-7.5 [&>span>span:first-child]:truncate" />
            </TagsInput.Control>
          </TagsInput.Root>

          <SettingsCheckbox
            checked={enabled}
            onChange={onToggleEnable}
            label="Apply Your Selector Rules"
          />
        </div>
      ) : (
        emptyRule
      )}

      <RuleEditModal
        isOpen={isModalOpen}
        onClose={handleClose}
        onSave={handleModalSave}
        editingRule={editingRule}
        existingRules={customRules}
      />
    </div>
  );
}

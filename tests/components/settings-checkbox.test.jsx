import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SettingsCheckbox from '@/components/ui/checkbox/settings-checkbox';

describe('SettingsCheckbox', () => {
  it('renders with label', () => {
    render(
      <SettingsCheckbox
        label="Test Label"
        checked={false}
        onChange={() => {}}
      />
    );

    expect(screen.getByText('Test Label')).toBeInTheDocument();
  });

  it('renders with description', () => {
    render(
      <SettingsCheckbox
        label="Test Label"
        description="Test description"
        checked={false}
        onChange={() => {}}
      />
    );

    expect(screen.getByText('Test description')).toBeInTheDocument();
  });

  it('renders with children', () => {
    render(
      <SettingsCheckbox
        label="Test Label"
        checked={false}
        onChange={() => {}}
      >
        <div>Child content</div>
      </SettingsCheckbox>
    );

    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('calls onChange when checkbox is clicked', () => {
    const handleChange = vi.fn();
    render(
      <SettingsCheckbox
        label="Test Label"
        checked={false}
        onChange={handleChange}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(true, expect.any(Object));
  });

  it('calls onChange when label is clicked', () => {
    const handleChange = vi.fn();
    render(
      <SettingsCheckbox
        label="Test Label"
        checked={false}
        onChange={handleChange}
      />
    );

    const label = screen.getByText('Test Label');
    fireEvent.click(label);

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('does not call onChange when disabled', () => {
    const handleChange = vi.fn();
    render(
      <SettingsCheckbox
        label="Test Label"
        checked={false}
        disabled={true}
        onChange={handleChange}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(handleChange).not.toHaveBeenCalled();
  });

  it('applies disabled styling', () => {
    render(
      <SettingsCheckbox
        label="Test Label"
        description="Test description"
        checked={false}
        disabled={true}
        onChange={() => {}}
      />
    );

    const label = screen.getByText('Test Label');
    const description = screen.getByText('Test description');

    expect(label).toHaveClass('text-gray-400');
    expect(description).toHaveClass('text-gray-400');
  });

  it('applies enabled styling', () => {
    render(
      <SettingsCheckbox
        label="Test Label"
        description="Test description"
        checked={false}
        disabled={false}
        onChange={() => {}}
      />
    );

    const label = screen.getByText('Test Label');
    const description = screen.getByText('Test description');

    expect(label).toHaveClass('text-gray-700');
    expect(description).toHaveClass('text-gray-500');
  });

  it('applies custom className', () => {
    const { container } = render(
      <SettingsCheckbox
        label="Test Label"
        checked={false}
        onChange={() => {}}
        className="custom-class"
      />
    );

    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass('custom-class');
  });

  it('renders checked state', () => {
    render(
      <SettingsCheckbox
        label="Test Label"
        checked={true}
        onChange={() => {}}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
  });

  it('renders unchecked state', () => {
    render(
      <SettingsCheckbox
        label="Test Label"
        checked={false}
        onChange={() => {}}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
  });

  it('toggles from unchecked to checked', () => {
    const handleChange = vi.fn();
    const { rerender } = render(
      <SettingsCheckbox
        label="Test Label"
        checked={false}
        onChange={handleChange}
      />
    );

    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    expect(handleChange).toHaveBeenCalledWith(true, expect.any(Object));

    // Simulate parent updating the prop
    rerender(
      <SettingsCheckbox
        label="Test Label"
        checked={true}
        onChange={handleChange}
      />
    );

    expect(checkbox).toBeChecked();
  });

  it('supports JSX label', () => {
    const jsxLabel = (
      <>
        Test <strong>Bold</strong> Label
      </>
    );

    render(
      <SettingsCheckbox
        label={jsxLabel}
        checked={false}
        onChange={() => {}}
      />
    );

    // Check that the label contains all parts of the JSX
    expect(screen.getByText('Bold')).toBeInTheDocument();
    expect(screen.getByText((content, element) => {
      return element.tagName === 'LABEL' && element.textContent === 'Test Bold Label';
    })).toBeInTheDocument();
  });

  it('forwards additional props to container', () => {
    const { container } = render(
      <SettingsCheckbox
        label="Test Label"
        checked={false}
        onChange={() => {}}
        data-testid="custom-id"
      />
    );

    expect(container.firstChild).toHaveAttribute('data-testid', 'custom-id');
  });
});

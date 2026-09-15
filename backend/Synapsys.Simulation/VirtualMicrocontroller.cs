namespace Synapsys.Simulation;

public enum PinMode
{
    Input,
    Output,
}

/// <summary>
/// Minimal virtual microcontroller: digital pin state only (Lesson 1 scope).
/// Analog (ADC), PWM, and timing/signal propagation come in later phases.
/// </summary>
public class VirtualMicrocontroller
{
    private readonly Dictionary<int, PinMode> _modes = new();
    private readonly Dictionary<int, bool> _digitalState = new();

    public void SetPinMode(int pin, PinMode mode) => _modes[pin] = mode;

    public PinMode? GetPinMode(int pin) =>
        _modes.TryGetValue(pin, out var mode) ? mode : null;

    public void DigitalWrite(int pin, bool high)
    {
        if (GetPinMode(pin) != PinMode.Output)
            throw new InvalidOperationException(
                $"Pin {pin} is not configured as OUTPUT. Call pinMode({pin}, OUTPUT) first.");
        _digitalState[pin] = high;
    }

    public bool DigitalRead(int pin) => _digitalState.TryGetValue(pin, out var high) && high;
}

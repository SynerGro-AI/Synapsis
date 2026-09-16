using System.Security.Cryptography;

namespace Synapsys.Api;

/// <summary>
/// PBKDF2 password hashing: per-user random salt, 100k iterations, SHA-256,
/// constant-time verification. Stored as "iterations:saltHex:hashHex" so the
/// work factor can be raised later without invalidating existing accounts.
/// </summary>
public static class PasswordHasher
{
    private const int Iterations = 100_000;
    private const int SaltSize = 16;
    private const int HashSize = 32;

    public static string Hash(string password)
    {
        byte[] salt = RandomNumberGenerator.GetBytes(SaltSize);
        byte[] hash = Rfc2898DeriveBytes.Pbkdf2(
            password, salt, Iterations, HashAlgorithmName.SHA256, HashSize);
        return $"{Iterations}:{Convert.ToHexString(salt)}:{Convert.ToHexString(hash)}";
    }

    public static bool Verify(string password, string stored)
    {
        var parts = stored.Split(':');
        if (parts.Length != 3) return false;
        if (!int.TryParse(parts[0], out var iterations)) return false;
        byte[] salt = Convert.FromHexString(parts[1]);
        byte[] expected = Convert.FromHexString(parts[2]);
        byte[] actual = Rfc2898DeriveBytes.Pbkdf2(
            password, salt, iterations, HashAlgorithmName.SHA256, expected.Length);
        return CryptographicOperations.FixedTimeEquals(actual, expected);
    }
}

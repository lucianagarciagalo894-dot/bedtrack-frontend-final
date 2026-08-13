using BedTrack.Application.Interfaces;
using BedTrack.Application.Services;
using BedTrack.Domain.Entities;
using BedTrack.Infrastructure.Data;
using BedTrack.Infrastructure.Repositories;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddScoped<IHospitalRepository, HospitalRepository>();
builder.Services.AddScoped<IHospitalService, HospitalService>();

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("PermitirReact", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter(System.Text.Json.JsonNamingPolicy.CamelCase));
    });

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

app.UseForwardedHeaders();

using (var scope = app.Services.CreateScope())
{
    var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    
    try
    {
        context.Database.Migrate();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error ejecutando Database.Migrate(): {ex.Message}");
    }

    try
    {
        context.Database.ExecuteSqlRaw(@"
            ALTER TABLE IF EXISTS ""HistorialCamas"" ADD COLUMN IF NOT EXISTS ""NosocomioId"" integer NULL;
            ALTER TABLE IF EXISTS ""HistorialCamas"" ADD COLUMN IF NOT EXISTS ""SucursalId"" integer NULL;
            ALTER TABLE IF EXISTS ""HistorialCamas"" ADD COLUMN IF NOT EXISTS ""UsuarioRol"" character varying(50) DEFAULT 'enfermeria';

            UPDATE ""HistorialCamas"" h
            SET ""SucursalId"" = p.""SucursalId"",
                ""NosocomioId"" = s.""NosocomioId""
            FROM ""Camas"" c
            JOIN ""Habitaciones"" hab ON c.""HabitacionId"" = hab.""Id""
            JOIN ""Pisos"" p ON hab.""PisoId"" = p.""Id""
            JOIN ""Sucursales"" s ON p.""SucursalId"" = s.""Id""
            WHERE h.""CamaId"" = c.""Id"" AND (h.""SucursalId"" IS NULL OR h.""NosocomioId"" IS NULL);
        ");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error añadiendo columnas faltantes o ejecutando backfill en HistorialCamas: {ex.Message}");
    }

    try
    {
        var testHospitals = context.Nosocomios
            .Where(n => n.Nombre.ToLower().Contains("prueba") || 
                        n.Nombre.ToLower().Contains("hospital nuevo") || 
                        n.Nombre.ToLower().Contains("hospital central bedtrack") || 
                        n.Nombre.ToLower().Contains("sanatorio allende") || 
                        n.Codigo == "HC-01" || 
                        n.Codigo == "SA-02" || 
                        n.Nombre.ToLower().Contains("cypress"))
            .ToList();

        if (testHospitals.Any())
        {
            var testIds = testHospitals.Select(h => h.Id).ToList();
            var sucursalIds = context.Sucursales.Where(s => testIds.Contains(s.NosocomioId)).Select(s => s.Id).ToList();
            var pisoIds = context.Pisos.Where(p => p.SucursalId.HasValue && sucursalIds.Contains(p.SucursalId.Value)).Select(p => p.Id).ToList();
            var roomIds = context.Habitaciones.Where(h => pisoIds.Contains(h.PisoId)).Select(h => h.Id).ToList();
            var beds = context.Camas.Where(c => roomIds.Contains(c.HabitacionId)).ToList();
            var bedIds = beds.Select(b => b.Id).ToList();
            var pacientes = context.Pacientes.Where(p => p.Cama != null && bedIds.Contains(p.Cama.Id)).ToList();
            var historial = bedIds.Any() ? context.HistorialCamas.Where(h => bedIds.Contains(h.CamaId)).ToList() : new List<HistorialCama>();

            if (historial.Any()) context.HistorialCamas.RemoveRange(historial);
            if (pacientes.Any()) context.Pacientes.RemoveRange(pacientes);
            if (beds.Any()) context.Camas.RemoveRange(beds);
            context.SaveChanges();

            if (roomIds.Any()) context.Habitaciones.RemoveRange(context.Habitaciones.Where(h => roomIds.Contains(h.Id)));
            if (pisoIds.Any()) context.Pisos.RemoveRange(context.Pisos.Where(p => pisoIds.Contains(p.Id)));
            if (sucursalIds.Any()) context.Sucursales.RemoveRange(context.Sucursales.Where(s => sucursalIds.Contains(s.Id)));
            context.UsuariosStaff.RemoveRange(context.UsuariosStaff.Where(u => u.NosocomioId.HasValue && testIds.Contains(u.NosocomioId.Value)));
            context.Nosocomios.RemoveRange(testHospitals);
            context.SaveChanges();
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error al purgar hospitales de prueba: {ex.Message}");
    }

    try
    {
        var orphanFloors = context.Pisos.Where(p => p.SucursalId == null).ToList();
        if (orphanFloors.Any())
        {
            var orphanFloorIds = orphanFloors.Select(p => p.Id).ToList();
            var orphanRooms = context.Habitaciones.Where(h => orphanFloorIds.Contains(h.PisoId)).ToList();
            var orphanRoomIds = orphanRooms.Select(h => h.Id).ToList();
            var orphanBeds = context.Camas.Where(c => orphanRoomIds.Contains(c.HabitacionId)).ToList();
            var orphanBedIds = orphanBeds.Select(b => b.Id).ToList();
            var orphanPacientes = context.Pacientes.Where(p => p.Cama != null && orphanBedIds.Contains(p.Cama.Id)).ToList();
            var orphanHistorial = orphanBedIds.Any() ? context.HistorialCamas.Where(h => orphanBedIds.Contains(h.CamaId)).ToList() : new List<HistorialCama>();

            if (orphanHistorial.Any()) context.HistorialCamas.RemoveRange(orphanHistorial);
            if (orphanPacientes.Any()) context.Pacientes.RemoveRange(orphanPacientes);
            if (orphanBeds.Any()) context.Camas.RemoveRange(orphanBeds);
            if (orphanRooms.Any()) context.Habitaciones.RemoveRange(orphanRooms);
            context.Pisos.RemoveRange(orphanFloors);
            context.SaveChanges();
        }

        var validNosocomioIds = context.Nosocomios.Select(n => n.Id).ToList();
        var validSucursalIds = context.Sucursales.Select(s => s.Id).ToList();
        var validBedIds = context.Camas.Select(c => c.Id).ToList();

        // Purga de todos los pacientes huérfanos/residuales sin cama activa válida
        var leftoverPacientes = context.Pacientes.Where(p => p.Cama == null || !validBedIds.Contains(p.Cama.Id)).ToList();
        if (leftoverPacientes.Any())
        {
            context.Pacientes.RemoveRange(leftoverPacientes);
            context.SaveChanges();
        }

        // Purga de todos los usuarios de staff huérfanos o de prueba
        var leftoverUsers = context.UsuariosStaff
            .Where(u => (u.NosocomioId.HasValue && !validNosocomioIds.Contains(u.NosocomioId.Value)) ||
                        (u.SucursalId.HasValue && !validSucursalIds.Contains(u.SucursalId.Value)) ||
                        (u.Email != null && (u.Email.Contains("hospital.com") || u.Email.Contains("prueba") || u.Email.Contains("test.com"))))
            .ToList();
        if (leftoverUsers.Any())
        {
            context.UsuariosStaff.RemoveRange(leftoverUsers);
            context.SaveChanges();
        }

        // Purga de todos los registros de HistorialCamas huérfanos o ficticios
        var leftoverHistorial = context.HistorialCamas
            .Where(h => !validBedIds.Contains(h.CamaId) ||
                        (h.NosocomioId.HasValue && !validNosocomioIds.Contains(h.NosocomioId.Value)) ||
                        (h.SucursalId.HasValue && !validSucursalIds.Contains(h.SucursalId.Value)) ||
                        (h.UsuarioEmail != null && (h.UsuarioEmail.Contains("hospital.com") || h.UsuarioEmail.Contains("prueba") || h.UsuarioEmail.Contains("test"))) ||
                        (h.UsuarioNombre != null && (h.UsuarioNombre.Contains("María Elena") || h.UsuarioNombre.Contains("Carlos Encargado") || h.UsuarioNombre.Contains("Cristian Rodríguez") || h.UsuarioNombre.ToLower().Contains("prueba"))))
            .ToList();
        if (leftoverHistorial.Any())
        {
            context.HistorialCamas.RemoveRange(leftoverHistorial);
            context.SaveChanges();
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"Error al purgar pisos, pacientes, usuarios o historial huérfanos: {ex.Message}");
    }
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseRouting();

app.UseCors("PermitirReact");

app.MapControllers();

app.Run();